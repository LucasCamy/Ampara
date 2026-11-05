import { describe, expect, it } from 'vitest'
import { canViewTransaction, personalTabView, visibleTransactions } from './privacy'
import type { PartnerId, Transaction } from './types'

function tx(id: string, createdBy: PartnerId, scope: Transaction['scope'], gift = false, amountCents = 1000): Transaction {
  return {
    id,
    createdBy,
    paidBy: createdBy,
    scope,
    isSecretGift: gift,
    type: 'EXPENSE',
    status: 'CONFIRMED_SOLID',
    amountCents,
    category: 'OTHER',
    description: id,
    splitRule: scope === 'COUPLE' ? '50_50' : null,
    partnerAShareCents: 0,
    partnerBShareCents: 0,
    competenceDate: '2026-11-05',
    updatedAt: '',
  }
}

const all = [
  tx('casal', 'A', 'COUPLE'),
  tx('cafe', 'A', 'PERSONAL', false, 1850),
  tx('alianca', 'A', 'PERSONAL', true, 90000),
  tx('academia', 'B', 'PERSONAL', false, 9990),
]

const profilesWith = (aShares: boolean, bShares = false) => ({
  A: { sharePersonalFinances: aShares, displayName: 'Lucas' },
  B: { sharePersonalFinances: bShares, displayName: 'Ela' },
})

describe('matriz de privacidade financeira', () => {
  it('dono sempre vê tudo o que criou, inclusive presentes', () => {
    const ids = visibleTransactions(all, 'A', profilesWith(false)).map((t) => t.id)
    expect(ids).toEqual(['casal', 'cafe', 'alianca'])
  })

  it('share OFF: o par vê só os gastos do casal', () => {
    const ids = visibleTransactions(all, 'B', profilesWith(false)).map((t) => t.id)
    expect(ids).toEqual(['casal', 'academia'])
  })

  it('share ON: o par vê pessoais, menos o presente/surpresa', () => {
    const ids = visibleTransactions(all, 'B', profilesWith(true)).map((t) => t.id)
    expect(ids).toEqual(['casal', 'cafe', 'academia'])
    expect(canViewTransaction(all[2] as Transaction, 'B', profilesWith(true))).toBe(false)
  })

  it('gasto do casal nunca é ocultado, mesmo marcado como presente por engano', () => {
    const casalGift = tx('x', 'A', 'COUPLE', true)
    expect(canViewTransaction(casalGift, 'B', profilesWith(false))).toBe(true)
  })

  it('aba pessoal do par fechada mostra estado privado, sem itens', () => {
    const view = personalTabView(all, 'A', 'B', profilesWith(false), '2026-11')
    expect(view).toEqual({ status: 'closed', ownerName: 'Lucas' })
  })

  it('aba pessoal do par aberta é somente leitura, sem o presente, mas o total inclui o presente', () => {
    const view = personalTabView(all, 'A', 'B', profilesWith(true), '2026-11')
    expect(view.status).toBe('readonly')
    if (view.status !== 'readonly') return
    expect(view.items.map((t) => t.id)).toEqual(['cafe'])
    expect(view.items.some((t) => t.description === 'alianca')).toBe(false)
    expect(view.totalCents).toBe(1850 + 90000)
  })

  it('a própria aba mostra tudo', () => {
    const view = personalTabView(all, 'A', 'A', profilesWith(false), '2026-11')
    expect(view.status).toBe('own')
    if (view.status === 'own') expect(view.items).toHaveLength(2)
  })
})
