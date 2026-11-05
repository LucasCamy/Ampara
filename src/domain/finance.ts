import { monthKey } from './dates'
import { formatCents } from './format'
import type { Couple, DateKey, PartnerId, Profile, SplitRule, Transaction } from './types'
import { otherPartner } from './types'

export interface Shares {
  partnerAShareCents: number
  partnerBShareCents: number
}

/**
 * Calcula quanto cabe a cada parceiro em um gasto do casal.
 * Sempre em centavos inteiros: a soma das partes é exatamente o valor.
 * Centavo ímpar fica com quem pagou (o outro nunca deve fração a mais).
 */
export function computeShares(
  amountCents: number,
  rule: SplitRule,
  paidBy: PartnerId,
  ratioABps: number,
  custom?: Shares,
): Shares {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error('amountCents precisa ser inteiro >= 0')
  }
  switch (rule) {
    case '50_50': {
      const nonPayer = Math.floor(amountCents / 2)
      const payer = amountCents - nonPayer
      return paidBy === 'A'
        ? { partnerAShareCents: payer, partnerBShareCents: nonPayer }
        : { partnerAShareCents: nonPayer, partnerBShareCents: payer }
    }
    case 'PROPORTIONAL': {
      const bps = Math.min(10000, Math.max(0, Math.round(ratioABps)))
      const exactA = (amountCents * bps) / 10000
      // arredonda a favor de quem pagou
      const a = paidBy === 'A' ? Math.ceil(exactA) : Math.floor(exactA)
      return { partnerAShareCents: a, partnerBShareCents: amountCents - a }
    }
    case 'FULL_FOR_PARTNER':
      return paidBy === 'A'
        ? { partnerAShareCents: 0, partnerBShareCents: amountCents }
        : { partnerAShareCents: amountCents, partnerBShareCents: 0 }
    case 'CUSTOM': {
      if (!custom) throw new Error('Divisão personalizada exige as partes')
      if (custom.partnerAShareCents + custom.partnerBShareCents !== amountCents) {
        throw new Error('As partes precisam somar o valor total')
      }
      return { ...custom }
    }
  }
}

export function defaultSplitRule(couple: Couple): SplitRule {
  return couple.splitMode === 'PROPORTIONAL' ? 'PROPORTIONAL' : '50_50'
}

/** Quanto deste gasto cabe a uma pessoa */
export function shareOf(tx: Transaction, who: PartnerId): number {
  return who === 'A' ? tx.partnerAShareCents : tx.partnerBShareCents
}

export interface CoupleBalance {
  /** > 0: B deve a A. < 0: A deve a B. Em centavos. */
  netCents: number
  confirmedTotalCents: number
  predictedTotalCents: number
  settledCents: number
  confirmedCount: number
  predictedCount: number
}

/**
 * Saldo líquido do mês entre o casal.
 * Saldo = Σ(parte de B nos gastos pagos por A) − Σ(parte de A nos gastos pagos por B)
 *         − Σ(acertos de B para A) + Σ(acertos de A para B)
 * Previstos (tracejado) não entram na dívida até virarem pagos.
 */
export function computeCoupleBalance(transactions: Transaction[], month: string): CoupleBalance {
  const out: CoupleBalance = {
    netCents: 0,
    confirmedTotalCents: 0,
    predictedTotalCents: 0,
    settledCents: 0,
    confirmedCount: 0,
    predictedCount: 0,
  }
  for (const tx of transactions) {
    if (tx.scope !== 'COUPLE' || monthKey(tx.competenceDate) !== month) continue
    if (tx.type === 'SETTLEMENT') {
      out.netCents += tx.paidBy === 'B' ? -tx.amountCents : tx.amountCents
      out.settledCents += tx.amountCents
      continue
    }
    if (tx.type !== 'EXPENSE') continue
    if (tx.status === 'PREDICTED_DASHED') {
      out.predictedTotalCents += tx.amountCents
      out.predictedCount += 1
      continue
    }
    out.confirmedTotalCents += tx.amountCents
    out.confirmedCount += 1
    if (tx.paidBy === 'A') out.netCents += tx.partnerBShareCents
    else out.netCents -= tx.partnerAShareCents
  }
  return out
}

export interface SettlementPlan {
  from: PartnerId
  to: PartnerId
  amountCents: number
}

export function settlementPlan(netCents: number): SettlementPlan | null {
  if (netCents === 0) return null
  return netCents > 0
    ? { from: 'B', to: 'A', amountCents: netCents }
    : { from: 'A', to: 'B', amountCents: -netCents }
}

/** Frase humana do encontro de contas, do ponto de vista de quem está olhando */
export function describeBalance(
  netCents: number,
  viewer: PartnerId,
  profiles: Record<PartnerId, Pick<Profile, 'displayName'>>,
  monthLabel: string,
): string {
  const plan = settlementPlan(netCents)
  if (!plan) return `R$ 0,00 · Contas de ${monthLabel} em dia`
  const amount = formatCents(plan.amountCents)
  const name = (id: PartnerId) => (id === viewer ? 'Você' : profiles[id].displayName)
  const to = plan.to === viewer ? 'você' : profiles[plan.to].displayName
  return `${name(plan.from)} transfere ${amount} para ${to} para zerar ${monthLabel}`
}

/** Cria a transação de quitação que zera o saldo */
export function buildSettlement(
  netCents: number,
  createdBy: PartnerId,
  date: DateKey,
  id: string,
  nowIso: string,
): Transaction | null {
  const plan = settlementPlan(netCents)
  if (!plan) return null
  return {
    id,
    createdBy,
    paidBy: plan.from,
    scope: 'COUPLE',
    isSecretGift: false,
    type: 'SETTLEMENT',
    status: 'CONFIRMED_SOLID',
    amountCents: plan.amountCents,
    category: 'OTHER',
    description: 'Acerto do mês',
    splitRule: null,
    partnerAShareCents: 0,
    partnerBShareCents: 0,
    competenceDate: date,
    updatedAt: nowIso,
  }
}

/** Total pessoal do mês (gastos confirmados) de uma pessoa */
export function personalMonthTotal(transactions: Transaction[], owner: PartnerId, month: string): number {
  return transactions
    .filter(
      (t) =>
        t.scope === 'PERSONAL' &&
        t.type === 'EXPENSE' &&
        t.createdBy === owner &&
        t.status === 'CONFIRMED_SOLID' &&
        monthKey(t.competenceDate) === month,
    )
    .reduce((s, t) => s + t.amountCents, 0)
}

/** Parte de uma pessoa nos gastos confirmados do casal no mês */
export function coupleShareTotal(transactions: Transaction[], who: PartnerId, month: string): number {
  return transactions
    .filter(
      (t) =>
        t.scope === 'COUPLE' &&
        t.type === 'EXPENSE' &&
        t.status === 'CONFIRMED_SOLID' &&
        monthKey(t.competenceDate) === month,
    )
    .reduce((s, t) => s + shareOf(t, who), 0)
}

export function splitRuleLabel(rule: SplitRule | null, ratioABps: number): string {
  switch (rule) {
    case '50_50':
      return 'Divisão 50/50'
    case 'PROPORTIONAL':
      return `Proporcional ${ratioABps / 100}/${(10000 - ratioABps) / 100}`
    case 'FULL_FOR_PARTNER':
      return '100% adiantado para o par'
    case 'CUSTOM':
      return 'Divisão personalizada'
    default:
      return ''
  }
}

/** Parte do outro (quem não pagou) num gasto do casal */
export function nonPayerShare(tx: Transaction): { who: PartnerId; cents: number } {
  const who = otherPartner(tx.paidBy)
  return { who, cents: shareOf(tx, who) }
}
