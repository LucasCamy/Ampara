import { describe, expect, it } from 'vitest'
import { categorySummary } from './summary'
import type { Transaction } from './types'

const t = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(),
  createdBy: 'A',
  paidBy: 'A',
  scope: 'COUPLE',
  isSecretGift: false,
  type: 'EXPENSE',
  status: 'CONFIRMED_SOLID',
  amountCents: 1000,
  category: 'MARKET',
  description: '',
  splitRule: '50_50',
  partnerAShareCents: 500,
  partnerBShareCents: 500,
  competenceDate: '2026-11-03',
  updatedAt: '',
  ...p,
})

describe('para onde foi o dinheiro', () => {
  it('soma por categoria, do maior para o menor, com a fatia e o mês anterior', () => {
    const s = categorySummary(
      [
        t({ amountCents: 30000 }),
        t({ amountCents: 10000, category: 'FOOD' }),
        t({ amountCents: 20000, category: 'FOOD' }),
        t({ amountCents: 40000, category: 'HOME' }),
        t({ amountCents: 25000, competenceDate: '2026-10-20' }),
        t({ amountCents: 99999, status: 'PREDICTED_DASHED' }),
        t({ amountCents: 50000, type: 'SETTLEMENT' }),
      ],
      '2026-11',
      '2026-10',
    )
    expect(s.rows.map((r) => [r.category, r.cents, r.prevCents])).toEqual([
      ['HOME', 40000, 0],
      ['FOOD', 30000, 0],
      ['MARKET', 30000, 25000],
    ])
    expect(s.totalCents).toBe(100000)
    expect(s.prevTotalCents).toBe(25000)
    expect(s.rows[0]!.share).toBeCloseTo(0.4)
  })

  it('mês sem gasto pago: lista vazia', () => {
    expect(categorySummary([t({ status: 'PREDICTED_DASHED' })], '2026-11', '2026-10')).toEqual({ rows: [], totalCents: 0, prevTotalCents: 0 })
  })
})
