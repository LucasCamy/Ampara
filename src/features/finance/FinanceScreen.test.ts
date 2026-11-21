import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEmpty } from '../../domain/seed'
import type { PartnerId, Transaction } from '../../domain/types'

vi.mock('../../store/ui', async () => {
  const { createStore, useStore } = await import('../../store/createStore')
  const store = createStore({ viewer: 'A' as PartnerId })
  return {
    uiStore: store,
    useUi: <S>(selector: (state: { viewer: PartnerId }) => S) => useStore(store, selector),
    ui: { toast: vi.fn(), openSheet: vi.fn() },
  }
})

const { dataStore } = await import('../../store/data')
const { minuteClock } = await import('../../store/clock')
const { FinanceScreen } = await import('./FinanceScreen')

const transaction = (id: string, amountCents: number, other: Partial<Transaction> = {}): Transaction => ({
  id, amountCents, description: id, createdBy: 'A', paidBy: 'A', scope: 'PERSONAL', type: 'EXPENSE', status: 'CONFIRMED_SOLID', isSecretGift: false,
  category: 'HEALTH', splitRule: null, partnerAShareCents: amountCents, partnerBShareCents: 0, competenceDate: '2026-11-21', updatedAt: '', ...other,
})
const render = () => renderToStaticMarkup(createElement(FinanceScreen))

beforeEach(() => {
  minuteClock.set(() => new Date('2026-11-21T12:00:00Z').getTime())
  dataStore.set(() => buildEmpty(new Date('2026-11-21T12:00:00Z'), 'SOLO'))
})

describe('finanças em um espaço pessoal', () => {
  it('mostra painel único com gastos pessoais, contas e resumo sem abas, privacidade ou acerto', () => {
    dataStore.set((state) => ({ ...state, transactions: {
      próprio: transaction('gasto pessoal autorizado', 3500),
      previsto: transaction('conta prevista própria', 12000, { status: 'PREDICTED_DASHED' }),
      casal: transaction('despesa de casal excluída', 999999, { scope: 'COUPLE' }),
      par: transaction('segredo do par excluído', 999999, { createdBy: 'B', paidBy: 'B', isSecretGift: true }),
    } }))
    const html = render()
    expect(html).toContain('data-testid="solo-finance"')
    expect(html).toContain('gasto pessoal autorizado')
    expect(html).toContain('conta prevista própria')
    expect(html).toContain('R$ 35,00')
    expect(html).toContain('R$ 120,00')
    expect(html).toContain('data-testid="rules-PERSONAL"')
    expect(html).not.toContain('despesa de casal excluída')
    expect(html).not.toContain('segredo do par excluído')
    expect(html).not.toContain('Escopo financeiro')
    expect(html).not.toContain('Encontro de contas')
    expect(html).not.toContain('share-toggle')
  })

  it('barra do teto anuncia valores e limita o progresso a 100 quando ultrapassado', () => {
    dataStore.set((state) => ({ ...state, profiles: { ...state.profiles, A: { ...state.profiles.A!, monthlyBudgetCents: 2000 } }, transactions: { own: transaction('Farmácia', 3500) } }))
    const html = render()
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="100"')
    expect(html).toContain('aria-valuetext="R$ 35,00 realizados de R$ 20,00 de teto mensal"')
    expect(html).toContain('acima do teto neste mês')
  })

  it.each(['SOLO', 'COUPLE'] as const)('oculta caixinhas desativadas no modo %s', (mode) => {
    dataStore.set(() => buildEmpty(new Date('2026-11-21T12:00:00Z'), mode))
    dataStore.set((state) => ({ ...state, profiles: { ...state.profiles, A: { ...state.profiles.A!, enabledModules: { cycle: true, shopping: true, goals: false } } } }))
    expect(render()).not.toContain('data-testid="goals-section"')
  })

  it('mantém abas e encontro de contas no modo Casal', () => {
    dataStore.set(() => buildEmpty(new Date('2026-11-21T12:00:00Z')))
    const html = render()
    expect(html).toContain('Escopo financeiro')
    expect(html).toContain('Encontro de contas')
    expect(html).toContain('data-testid="goals-section"')
    expect(html).not.toContain('data-testid="solo-finance"')
  })
})
