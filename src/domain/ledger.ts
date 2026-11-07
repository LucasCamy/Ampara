import { daysBetween } from './cycle'
import { parseDateKey, toDateKey } from './dates'
import { computeShares } from './finance'
import type { DateKey, PartnerId, RecurringRule, SplitRule, Transaction } from './types'

/**
 * Lançamentos no tempo: baixa, vencidos, parcelas e contas fixas. Funções puras.
 * Parcelas e ocorrências de conta fixa têm id determinístico: os dois aparelhos geram o MESMO lançamento
 * (o upsert é idempotente) em vez de duplicar.
 */

/** Momento "zero" das ocorrências geradas: qualquer edição real (baixa, valor) é mais nova e vence. */
export const GENERATED_AT = '2000-01-01T00:00:00.000Z'

/** UUID determinístico a partir de um texto (hash cyrb128; formato aceito pelo Postgres) */
export function seededUuid(seed: string): string {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('')
  // versão 8 (personalizado) e variante RFC 4122
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/* ---------- meses ---------- */

export const monthOf = (date: DateKey) => date.slice(0, 7)

/** "2026-11" + n meses */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y!, m! - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb! - ya!) * 12 + (mb! - ma!)
}

/** Dia do mês limitado ao último dia (31 em fevereiro vira 28/29) */
export function dayInMonth(month: string, day: number): DateKey {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y!, m!, 0).getDate()
  return toDateKey(new Date(y!, m! - 1, Math.min(Math.max(1, day), last)))
}

/** Mesma data n meses depois (dia limitado ao mês) */
export const addMonths = (date: DateKey, n: number) => dayInMonth(shiftMonth(monthOf(date), n), parseDateKey(date).getDate())

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export function monthTitle(month: string, current: string): string {
  const [y, m] = month.split('-').map(Number)
  const name = MONTHS[m! - 1]!
  return month.slice(0, 4) === current.slice(0, 4) ? name : `${name} de ${y}`
}

/* ---------- baixa e vencidos ---------- */

export function isOverdue(tx: Transaction, today: DateKey): boolean {
  return tx.type === 'EXPENSE' && tx.status === 'PREDICTED_DASHED' && tx.competenceDate < today
}

export const daysOverdue = (tx: Transaction, today: DateKey) => Math.max(0, daysBetween(tx.competenceDate, today))

/** Partes de cada um para um lançamento (casal divide; pessoal fica todo com o dono) */
export function sharesFor(scope: Transaction['scope'], amountCents: number, rule: SplitRule | null, paidBy: PartnerId, owner: PartnerId, ratioABps: number) {
  if (scope === 'COUPLE') return computeShares(amountCents, rule ?? '50_50', paidBy, ratioABps)
  return owner === 'A' ? { partnerAShareCents: amountCents, partnerBShareCents: 0 } : { partnerAShareCents: 0, partnerBShareCents: amountCents }
}

export interface PayInput {
  amountCents: number
  paidBy: PartnerId
  paidAt: DateKey
}

/** Dar baixa: vira pago (sólido), com o valor real e quem pagou; o mês de competência não muda */
export function payTx(tx: Transaction, p: PayInput, ratioABps: number, nowIso: string): Transaction {
  const paidBy = tx.scope === 'COUPLE' ? p.paidBy : tx.createdBy
  return {
    ...tx,
    ...sharesFor(tx.scope, p.amountCents, tx.splitRule, paidBy, tx.createdBy, ratioABps),
    amountCents: p.amountCents,
    paidBy,
    status: 'CONFIRMED_SOLID',
    paidAt: p.paidAt,
    updatedAt: nowIso,
  }
}

/** Desfazer a baixa: volta a previsto (tracejado) */
export function unpayTx(tx: Transaction, nowIso: string): Transaction {
  return { ...tx, status: 'PREDICTED_DASHED', paidAt: null, updatedAt: nowIso }
}

/* ---------- parcelas ---------- */

export const MAX_INSTALLMENTS = 48

/** Divide em centavos exatos; o resto vai para a primeira parcela */
export function splitInstallments(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n)
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? totalCents - base * n : 0))
}

/**
 * Gera as parcelas de uma compra. `first` traz tudo do lançamento (sem id/valor/data) e o status da 1ª;
 * as demais nascem previstas, uma por mês, no mesmo dia.
 */
export function buildInstallments(
  first: Omit<Transaction, 'id' | 'amountCents' | 'competenceDate' | 'partnerAShareCents' | 'partnerBShareCents'>,
  totalCents: number,
  n: number,
  firstDate: DateKey,
  groupId: string,
  ratioABps: number,
): Transaction[] {
  const amounts = splitInstallments(totalCents, n)
  return amounts.map((amountCents, i) => ({
    ...first,
    id: seededUuid(`inst:${groupId}:${i + 1}`),
    amountCents,
    ...sharesFor(first.scope, amountCents, first.splitRule, first.paidBy, first.createdBy, ratioABps),
    competenceDate: addMonths(firstDate, i),
    status: i === 0 ? first.status : 'PREDICTED_DASHED',
    paidAt: i === 0 && first.status === 'CONFIRMED_SOLID' ? (first.paidAt ?? null) : null,
    installmentGroup: groupId,
    installmentN: i + 1,
    installmentTotal: n,
  }))
}

/* ---------- contas fixas ---------- */

export const occurrenceId = (ruleId: string, month: string) => seededUuid(`rec:${ruleId}:${month}`)

export function ruleActiveIn(rule: RecurringRule, month: string): boolean {
  return month >= rule.startMonth && (!rule.endMonth || month <= rule.endMonth) && !rule.skipMonths.includes(month)
}

export function occurrenceFor(rule: RecurringRule, month: string, ratioABps: number): Transaction {
  return {
    id: occurrenceId(rule.id, month),
    createdBy: rule.createdBy,
    paidBy: rule.paidBy,
    scope: rule.scope,
    isSecretGift: false,
    type: 'EXPENSE',
    status: 'PREDICTED_DASHED',
    amountCents: rule.amountCents,
    category: rule.category,
    description: rule.description,
    splitRule: rule.scope === 'COUPLE' ? (rule.splitRule ?? '50_50') : null,
    ...sharesFor(rule.scope, rule.amountCents, rule.splitRule, rule.paidBy, rule.createdBy, ratioABps),
    competenceDate: dayInMonth(month, rule.dayOfMonth),
    paidAt: null,
    recurrenceId: rule.id,
    updatedAt: GENERATED_AT,
  }
}

/** Quantos meses à frente as contas fixas aparecem como previstas */
export const RECURRENCE_HORIZON = 2

/**
 * Ocorrências que faltam do mês atual até o horizonte. Nunca recria uma que já existe (paga, editada)
 * nem um mês pulado; meses passados não são gerados (sem "vencidos" que ninguém lançou).
 */
export function missingOccurrences(rules: RecurringRule[], existing: Record<string, Transaction>, currentMonth: string, ratioABps: number, horizon = RECURRENCE_HORIZON): Transaction[] {
  const out: Transaction[] = []
  for (const rule of rules) {
    for (let i = 0; i <= horizon; i++) {
      const month = shiftMonth(currentMonth, i)
      if (!ruleActiveIn(rule, month)) continue
      const id = occurrenceId(rule.id, month)
      if (!existing[id]) out.push(occurrenceFor(rule, month, ratioABps))
    }
  }
  return out
}

/** Selo curto: "Parcela 3/10" ou "Fixa mensal" */
export function txBadge(tx: Transaction): string | null {
  if (tx.installmentTotal && tx.installmentN) return `Parcela ${tx.installmentN}/${tx.installmentTotal}`
  if (tx.recurrenceId) return 'Fixa mensal'
  return null
}

/** Privacidade das contas fixas (espelho de recurrences_read): do casal, ou minhas */
export const canViewRule = (r: Pick<RecurringRule, 'scope' | 'createdBy'>, viewer: PartnerId) => r.scope === 'COUPLE' || r.createdBy === viewer

/* ---------- validação do gasto ---------- */

export type Repeat = 'ONCE' | 'INSTALLMENTS' | 'MONTHLY'

export function validateRepeat(repeat: Repeat, installments: string, amountCents: number): string | undefined {
  if (repeat !== 'INSTALLMENTS') return undefined
  const n = Number(installments)
  if (!/^\d{1,2}$/.test(installments) || n < 2 || n > MAX_INSTALLMENTS) return `De 2 a ${MAX_INSTALLMENTS} parcelas.`
  if (amountCents < n) return 'Valor menor que o número de parcelas.'
  return undefined
}
