import { toDateKey } from '../domain/dates'
import { nonPayerShare } from '../domain/finance'
import { firstName, formatCents } from '../domain/format'
import { visibleTransactions } from '../domain/privacy'
import {
  buildInstallments,
  canViewRule,
  dayInMonth,
  missingOccurrences,
  monthOf,
  occurrenceFor,
  occurrenceId,
  payTx,
  sharesFor,
  shiftMonth,
  unpayTx,
  type PayInput,
  type Repeat,
} from '../domain/ledger'
import { parseDateKey } from '../domain/dates'
import { uuid } from '../domain/seed'
import type { PartnerId, RecurringRule, SplitRule, Transaction, TxCategory, TxStatus } from '../domain/types'
import { dataStore, transact, type Tx } from './data'
import { ui, uiStore } from './ui'

/** Finanças no tempo: parcelas, contas fixas, baixa e exclusão. Tudo com Desfazer. */

const nowIso = () => new Date().toISOString()
const today = () => toDateKey(new Date())
const viewer = () => uiStore.get().viewer
const ratio = () => dataStore.get().couple.couple?.ratioABps ?? 5000

/** O perfil também sincroniza com uma coluna integer no Postgres. */
export const MAX_MONTHLY_BUDGET_CENTS = 2_147_483_647

export function setMonthlyBudgetCents(cents: number | null): boolean {
  if (cents !== null && (!Number.isInteger(cents) || cents < 0 || cents > MAX_MONTHLY_BUDGET_CENTS)) return false
  const who = viewer()
  const profile = dataStore.get().profiles[who]
  if (!profile) return false
  if ((profile.monthlyBudgetCents ?? null) === cents) return true
  const undo = transact((tx) => tx.put('profiles', { ...profile, monthlyBudgetCents: cents, updatedAt: nowIso() }))
  ui.toast(cents === null ? 'Teto mensal removido' : `Teto mensal salvo · ${formatCents(cents)} por mês`, { undo })
  return true
}

export interface EntryInput {
  amountCents: number
  description: string
  category: TxCategory
  scope: 'COUPLE' | 'PERSONAL'
  paidBy: PartnerId
  splitRule: SplitRule
  isSecretGift: boolean
  status: TxStatus
  /** data do gasto ou vencimento */
  date: string
  repeat: Repeat
  /** só em INSTALLMENTS: número de parcelas (o valor é o total) */
  installments?: number
  /** Itens marcados cuja limpeza foi escolhida junto do gasto. Desfazer restaura gasto e lista. */
  checkedShoppingIds?: string[]
}

/** Pode gravar este lançamento? (espelho de tx_update: do casal, ou meu) */
const canWrite = (t: Pick<Transaction, 'scope' | 'createdBy'>) => t.scope === 'COUPLE' || t.createdBy === viewer()

export function saveEntry(input: EntryInput): boolean {
  const who = viewer()
  const isSolo = dataStore.get().couple.couple?.mode === 'SOLO'
  const scope = isSolo ? 'PERSONAL' : input.scope
  const isCouple = scope === 'COUPLE'
  const paidBy = isCouple ? input.paidBy : who
  const commit = (recipe: (tx: Tx) => void) => transact((tx) => {
    recipe(tx)
    for (const id of new Set(input.checkedShoppingIds ?? [])) {
      if (tx.get('shoppingItems', id)?.checked) tx.remove('shoppingItems', id)
    }
  })
  const base: Omit<Transaction, 'id' | 'amountCents' | 'competenceDate' | 'partnerAShareCents' | 'partnerBShareCents'> = {
    createdBy: who,
    paidBy,
    scope,
    isSecretGift: !isSolo && !isCouple && input.isSecretGift,
    type: 'EXPENSE',
    status: input.status,
    category: input.category,
    description: input.description.trim().slice(0, 60),
    splitRule: isCouple ? input.splitRule : null,
    paidAt: null,
    updatedAt: nowIso(),
  }

  if (input.repeat === 'INSTALLMENTS' && input.installments) {
    const parts = buildInstallments(base, input.amountCents, input.installments, input.date, uuid(), ratio())
    const undo = commit((tx) => parts.forEach((p) => tx.put('transactions', p)))
    ui.toast(`${input.installments}x de ${formatCents(parts[1]!.amountCents)} · ${base.description}`, { undo })
    return true
  }

  if (input.repeat === 'MONTHLY') {
    const rule: RecurringRule = {
      id: uuid(),
      createdBy: who,
      scope,
      description: base.description,
      category: input.category,
      amountCents: input.amountCents,
      paidBy,
      splitRule: base.splitRule,
      dayOfMonth: parseDateKey(input.date).getDate(),
      startMonth: monthOf(input.date),
      endMonth: null,
      skipMonths: [],
      updatedAt: nowIso(),
    }
    // a primeira ocorrência já sai com o status escolhido (paga ou prevista); as próximas, previstas
    const first = { ...occurrenceFor(rule, rule.startMonth, ratio()), competenceDate: input.date, status: input.status, updatedAt: nowIso() }
    const undo = commit((tx) => {
      tx.put('recurrences', rule)
      tx.put('transactions', first)
      const existing = { ...tx.state().transactions }
      for (const t of missingOccurrences([rule], existing, monthOf(today()) > rule.startMonth ? monthOf(today()) : rule.startMonth, ratio())) tx.put('transactions', t)
    })
    ui.toast(`Conta fixa criada · ${formatCents(rule.amountCents)} todo dia ${rule.dayOfMonth}`, { undo })
    return true
  }

  const t: Transaction = {
    ...base,
    id: uuid(),
    amountCents: input.amountCents,
    ...sharesFor(scope, input.amountCents, base.splitRule, paidBy, who, ratio()),
    competenceDate: input.date,
  }
  const undo = commit((tx) => tx.put('transactions', t))
  const future = input.date > today()
  let msg = `Gasto salvo · ${formatCents(t.amountCents)} · ${t.description}`
  if (t.status === 'PREDICTED_DASHED') msg = `${future ? 'Conta futura' : 'Previsto'} salvo · ${formatCents(t.amountCents)} · ${t.description}`
  else if (t.isSecretGift) msg = 'Presente salvo · oculto para o par'
  else if (isCouple) {
    // o que importa no casal: quanto da parte do outro entra no acerto
    const np = nonPayerShare(t)
    const name = firstName(dataStore.get().profiles[np.who]?.displayName) || 'seu par'
    msg = `Gasto salvo · ${np.who === who ? 'Sua parte' : `Parte de ${name}`}: ${formatCents(np.cents)} no acerto do mês`
  }
  ui.toast(msg, { undo })
  return true
}

/** Dar baixa com valor, quem pagou e data */
export function payTransaction(id: string, p: PayInput): boolean {
  const prev = dataStore.get().transactions[id]
  if (!prev || !canWrite(prev) || prev.type !== 'EXPENSE') return false
  const next = payTx(prev, p, ratio(), nowIso())
  const undo = transact((tx) => tx.put('transactions', next))
  ui.toast(`Baixa: ${prev.description} · ${formatCents(next.amountCents)}`, { undo })
  return true
}

/** Baixa rápida: o valor previsto, hoje, por quem tocou (ou pelo par) */
export const quickPay = (id: string, paidBy: PartnerId) => {
  const prev = dataStore.get().transactions[id]
  return prev ? payTransaction(id, { amountCents: prev.amountCents, paidBy, paidAt: today() }) : false
}

export function unpayTransaction(id: string): boolean {
  const prev = dataStore.get().transactions[id]
  if (!prev || !canWrite(prev) || prev.status !== 'CONFIRMED_SOLID' || prev.type !== 'EXPENSE') return false
  const undo = transact((tx) => tx.put('transactions', unpayTx(prev, nowIso())))
  ui.toast(`Voltou para previsto · ${prev.description}`, { undo })
  return true
}

/**
 * Excluir. "FOLLOWING" vale para parcelas e contas fixas: tira esta e as próximas ainda previstas
 * (as já pagas ficam no histórico) e, na conta fixa, encerra a regra no mês anterior.
 */
export function deleteTransaction(id: string, mode: 'ONE' | 'FOLLOWING' = 'ONE'): boolean {
  const state = dataStore.get()
  const prev = state.transactions[id]
  if (!prev || !canWrite(prev)) return false
  const month = monthOf(prev.competenceDate)
  const rule = prev.recurrenceId ? state.recurrences[prev.recurrenceId] : undefined
  let removed = 1
  const undo = transact((tx) => {
    tx.remove('transactions', id)
    if (mode === 'ONE') {
      // ocorrência de conta fixa: marca o mês como pulado para não ser gerada de novo
      if (rule && canViewRule(rule, viewer())) tx.put('recurrences', { ...rule, skipMonths: [...new Set([...rule.skipMonths, month])], updatedAt: nowIso() })
      return
    }
    for (const t of Object.values(tx.state().transactions)) {
      const later = t.competenceDate > prev.competenceDate && t.status === 'PREDICTED_DASHED'
      const sameGroup = prev.installmentGroup && t.installmentGroup === prev.installmentGroup
      const sameRule = prev.recurrenceId && t.recurrenceId === prev.recurrenceId
      if (later && (sameGroup || sameRule)) {
        tx.remove('transactions', t.id)
        removed += 1
      }
    }
    if (rule && canViewRule(rule, viewer())) tx.put('recurrences', { ...rule, endMonth: shiftMonth(month, -1), updatedAt: nowIso() })
  })
  ui.toast(removed > 1 ? `${removed} lançamentos excluídos` : `Excluído · ${prev.description}`, { undo })
  return true
}

/* ---------- contas fixas ---------- */

/** Gera as ocorrências que faltam (mês atual até o horizonte). Silencioso; os dois aparelhos geram o mesmo id. */
export function materializeRecurrences() {
  const state = dataStore.get()
  const couple = state.couple.couple
  if (!couple) return
  const rules = Object.values(state.recurrences).filter((r) => canViewRule(r, viewer()))
  const missing = missingOccurrences(rules, state.transactions, monthOf(today()), couple.ratioABps)
  if (missing.length) transact((tx) => missing.forEach((t) => tx.put('transactions', t)))
}

export interface RuleInput {
  description: string
  amountCents: number
  dayOfMonth: number
}

export interface SuggestedRuleInput extends RuleInput {
  splitRule?: Exclude<SplitRule, 'CUSTOM'>
}

const validRuleInput = (input: RuleInput) => !!input.description.trim() && Number.isSafeInteger(input.amountCents) && input.amountCents > 0 && Number.isInteger(input.dayOfMonth) && input.dayOfMonth >= 1 && input.dayOfMonth <= 31

/** A sugestão referencia só o id; dados de uma transação alheia continuam passando pelo domínio. */
export function getRuleSourceTransaction(id: string | undefined): Transaction | null {
  if (!id) return null
  const state = dataStore.get()
  const source = visibleTransactions(Object.values(state.transactions), viewer(), state.profiles as Parameters<typeof visibleTransactions>[2]).find((tx) => tx.id === id)
  return source && canWrite(source) && source.type === 'EXPENSE' && !source.recurrenceId && !source.installmentGroup && !source.isSecretGift ? source : null
}

/** Cria uma conta futura sem duplicar os gastos históricos que deram origem à sugestão. */
export function createRuleFromTransaction(transactionId: string, input: SuggestedRuleInput): boolean {
  if (!validRuleInput(input)) return false
  const source = getRuleSourceTransaction(transactionId)
  if (!source || (source.scope === 'COUPLE' && source.splitRule === 'CUSTOM' && !input.splitRule)) return false
  const state = dataStore.get()
  const who = viewer()
  const scope = state.couple.couple?.mode === 'SOLO' ? 'PERSONAL' : source.scope
  const normalizeName = (name: string) => name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
  const current = monthOf(today())
  const startMonth = shiftMonth(current, 1)
  const duplicate = Object.values(state.recurrences).some((rule) => canViewRule(rule, who) && rule.scope === scope && rule.category === source.category && normalizeName(rule.description) === normalizeName(input.description) && (!rule.endMonth || rule.endMonth >= startMonth))
  if (duplicate) return false
  const rule: RecurringRule = {
    id: uuid(), createdBy: who, scope, description: input.description.trim().slice(0, 60), category: source.category,
    amountCents: input.amountCents, paidBy: scope === 'COUPLE' ? source.paidBy : who,
    splitRule: scope === 'COUPLE' ? input.splitRule ?? source.splitRule ?? '50_50' : null,
    dayOfMonth: input.dayOfMonth, startMonth, endMonth: null, skipMonths: [], updatedAt: nowIso(),
  }
  const undo = transact((tx) => {
    tx.put('recurrences', rule)
    for (const occurrence of missingOccurrences([rule], tx.state().transactions, current, ratio())) tx.put('transactions', occurrence)
  })
  ui.toast(`Conta fixa criada · ${formatCents(rule.amountCents)} por mês a partir do próximo mês`, { undo })
  return true
}

/** Edita a regra e as ocorrências ainda previstas deste mês em diante (o que já foi pago não muda) */
export function saveRule(id: string, input: RuleInput): boolean {
  if (!validRuleInput(input)) return false
  const state = dataStore.get()
  const prev = state.recurrences[id]
  if (!prev || !canViewRule(prev, viewer())) return false
  const rule: RecurringRule = { ...prev, description: input.description.trim().slice(0, 60), amountCents: input.amountCents, dayOfMonth: input.dayOfMonth, updatedAt: nowIso() }
  const current = monthOf(today())
  const undo = transact((tx) => {
    tx.put('recurrences', rule)
    for (const t of Object.values(tx.state().transactions)) {
      if (t.recurrenceId !== id || t.status !== 'PREDICTED_DASHED' || monthOf(t.competenceDate) < current) continue
      const month = monthOf(t.competenceDate)
      tx.put('transactions', { ...occurrenceFor(rule, month, ratio()), id: occurrenceId(id, month), updatedAt: nowIso() })
    }
  })
  ui.toast(`Conta fixa atualizada · ${formatCents(rule.amountCents)} todo dia ${rule.dayOfMonth}`, { undo })
  return true
}

/** Encerra depois deste mês: as previstas dos próximos meses saem */
export function endRule(id: string): boolean {
  const state = dataStore.get()
  const prev = state.recurrences[id]
  if (!prev || !canViewRule(prev, viewer())) return false
  const current = monthOf(today())
  const undo = transact((tx) => {
    tx.put('recurrences', { ...prev, endMonth: current, updatedAt: nowIso() })
    for (const t of Object.values(tx.state().transactions)) {
      if (t.recurrenceId === id && t.status === 'PREDICTED_DASHED' && monthOf(t.competenceDate) > current) tx.remove('transactions', t.id)
    }
  })
  ui.toast(`Conta fixa encerrada · ${prev.description}`, { undo })
  return true
}

export const ruleDueLabel = (r: RecurringRule, month: string) => dayInMonth(month, r.dayOfMonth)
