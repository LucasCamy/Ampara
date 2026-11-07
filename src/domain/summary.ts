import type { Transaction, TxCategory } from './types'

/**
 * "Para onde foi": gastos pagos do mês por categoria, do maior para o menor, comparados com o mês anterior.
 * Recebe só lançamentos que quem está vendo pode ver (filtrar privacidade antes: domain/privacy).
 */

export interface CategoryRow {
  category: TxCategory
  cents: number
  /** fração do total do mês (0..1) */
  share: number
  /** mesmo período do mês anterior */
  prevCents: number
}

export interface MonthSummary {
  rows: CategoryRow[]
  totalCents: number
  prevTotalCents: number
}

const isPaidExpense = (t: Transaction) => t.type === 'EXPENSE' && t.status === 'CONFIRMED_SOLID'

export function categorySummary(transactions: Transaction[], month: string, prevMonth: string): MonthSummary {
  const now = new Map<TxCategory, number>()
  const before = new Map<TxCategory, number>()
  for (const t of transactions) {
    if (!isPaidExpense(t)) continue
    const m = t.competenceDate.slice(0, 7)
    if (m === month) now.set(t.category, (now.get(t.category) ?? 0) + t.amountCents)
    else if (m === prevMonth) before.set(t.category, (before.get(t.category) ?? 0) + t.amountCents)
  }
  const totalCents = [...now.values()].reduce((a, b) => a + b, 0)
  const prevTotalCents = [...before.values()].reduce((a, b) => a + b, 0)
  const rows = [...now.entries()]
    .map(([category, cents]) => ({ category, cents, share: totalCents ? cents / totalCents : 0, prevCents: before.get(category) ?? 0 }))
    .sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category))
  return { rows, totalCents, prevTotalCents }
}
