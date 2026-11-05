import { describe, expect, it } from 'vitest'
import { buildSettlement, computeCoupleBalance, computeShares, describeBalance } from './finance'
import type { PartnerId, SplitRule, Transaction } from './types'

const MONTH = '2026-11'
let seq = 0
function expense(
  amountCents: number,
  paidBy: PartnerId,
  rule: SplitRule = '50_50',
  extra: Partial<Transaction> = {},
): Transaction {
  const shares = computeShares(amountCents, rule, paidBy, 6000)
  return {
    id: `t${++seq}`,
    createdBy: paidBy,
    paidBy,
    scope: 'COUPLE',
    isSecretGift: false,
    type: 'EXPENSE',
    status: 'CONFIRMED_SOLID',
    amountCents,
    category: 'MARKET',
    description: 'x',
    splitRule: rule,
    ...shares,
    competenceDate: '2026-11-10',
    updatedAt: '',
    ...extra,
  }
}

const profiles = { A: { displayName: 'Lucas' }, B: { displayName: 'Ela' } }

describe('computeShares', () => {
  it('50/50 divide exato e soma o total', () => {
    expect(computeShares(30000, '50_50', 'A', 5000)).toEqual({ partnerAShareCents: 15000, partnerBShareCents: 15000 })
  })

  it('50/50 com centavo ímpar: quem pagou absorve o centavo', () => {
    const s = computeShares(1001, '50_50', 'A', 5000)
    expect(s).toEqual({ partnerAShareCents: 501, partnerBShareCents: 500 })
    const t = computeShares(1001, '50_50', 'B', 5000)
    expect(t).toEqual({ partnerAShareCents: 500, partnerBShareCents: 501 })
  })

  it('proporcional 60/40 usa a razão do casal', () => {
    expect(computeShares(10000, 'PROPORTIONAL', 'A', 6000)).toEqual({ partnerAShareCents: 6000, partnerBShareCents: 4000 })
  })

  it('proporcional arredonda a favor de quem pagou e nunca perde centavo', () => {
    const s = computeShares(999, 'PROPORTIONAL', 'B', 6000)
    expect(s.partnerAShareCents + s.partnerBShareCents).toBe(999)
    expect(s.partnerAShareCents).toBe(599) // 599,4 arredondado para baixo: A (não pagou) não paga fração
  })

  it('100% adiantado para o par: todo o valor é do outro', () => {
    expect(computeShares(4590, 'FULL_FOR_PARTNER', 'A', 5000)).toEqual({ partnerAShareCents: 0, partnerBShareCents: 4590 })
    expect(computeShares(4590, 'FULL_FOR_PARTNER', 'B', 5000)).toEqual({ partnerAShareCents: 4590, partnerBShareCents: 0 })
  })

  it('personalizado exige partes que somam o total', () => {
    expect(() => computeShares(1000, 'CUSTOM', 'A', 5000, { partnerAShareCents: 300, partnerBShareCents: 600 })).toThrow()
    expect(computeShares(1000, 'CUSTOM', 'A', 5000, { partnerAShareCents: 300, partnerBShareCents: 700 })).toEqual({
      partnerAShareCents: 300,
      partnerBShareCents: 700,
    })
  })

  it('rejeita valor fracionado ou negativo', () => {
    expect(() => computeShares(10.5, '50_50', 'A', 5000)).toThrow()
    expect(() => computeShares(-1, '50_50', 'A', 5000)).toThrow()
  })
})

describe('computeCoupleBalance', () => {
  it('reproduz o exemplo do doc 05: Ela transfere R$ 110,00 para Lucas', () => {
    const txs = [expense(30000, 'A'), expense(20000, 'B'), expense(12000, 'A')]
    const b = computeCoupleBalance(txs, MONTH)
    expect(b.netCents).toBe(11000)
    expect(b.confirmedTotalCents).toBe(62000)
    expect(describeBalance(b.netCents, 'A', profiles, 'novembro')).toBe('Ela transfere R$ 110,00 para você para zerar novembro')
    expect(describeBalance(b.netCents, 'B', profiles, 'novembro')).toBe('Você transfere R$ 110,00 para Lucas para zerar novembro')
  })

  it('previstos (tracejado) não entram na dívida, só no total previsto', () => {
    const txs = [expense(30000, 'A'), expense(12000, 'A', '50_50', { status: 'PREDICTED_DASHED' })]
    const b = computeCoupleBalance(txs, MONTH)
    expect(b.netCents).toBe(15000)
    expect(b.predictedTotalCents).toBe(12000)
    expect(b.predictedCount).toBe(1)
  })

  it('ignora gastos pessoais e de outros meses', () => {
    const txs = [
      expense(30000, 'A'),
      expense(5000, 'A', '50_50', { scope: 'PERSONAL' }),
      expense(8000, 'B', '50_50', { competenceDate: '2026-10-30' }),
    ]
    expect(computeCoupleBalance(txs, MONTH).netCents).toBe(15000)
  })

  it('adiantamento 100% vira crédito integral de quem pagou', () => {
    expect(computeCoupleBalance([expense(4590, 'A', 'FULL_FOR_PARTNER')], MONTH).netCents).toBe(4590)
    expect(computeCoupleBalance([expense(4590, 'B', 'FULL_FOR_PARTNER')], MONTH).netCents).toBe(-4590)
  })

  it('SETTLEMENT zera o saldo nos dois sentidos', () => {
    const txs = [expense(30000, 'A'), expense(20000, 'B'), expense(12000, 'A')]
    const before = computeCoupleBalance(txs, MONTH)
    const settle = buildSettlement(before.netCents, 'B', '2026-11-20', 's1', '')
    expect(settle?.paidBy).toBe('B')
    expect(settle?.amountCents).toBe(11000)
    const after = computeCoupleBalance([...txs, settle as Transaction], MONTH)
    expect(after.netCents).toBe(0)
    expect(describeBalance(after.netCents, 'A', profiles, 'novembro')).toBe('R$ 0,00 · Contas de novembro em dia')

    const reverse = [expense(20000, 'B')]
    const r = computeCoupleBalance(reverse, MONTH)
    expect(r.netCents).toBe(-10000)
    const s2 = buildSettlement(r.netCents, 'A', '2026-11-20', 's2', '') as Transaction
    expect(s2.paidBy).toBe('A')
    expect(computeCoupleBalance([...reverse, s2], MONTH).netCents).toBe(0)
  })

  it('sem saldo não gera acerto', () => {
    expect(buildSettlement(0, 'A', '2026-11-20', 's', '')).toBeNull()
  })
})
