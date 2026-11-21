import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEmpty } from '../../domain/seed'
import { COLLECTIONS, otherPartner, type Collections, type PartnerId, type RecurringRule, type Transaction } from '../../domain/types'

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
const { uiStore } = await import('../../store/ui')
const { FinanceScreen } = await import('./FinanceScreen')

const transaction = (id: string, amountCents: number, other: Partial<Transaction> = {}): Transaction => ({
  id, amountCents, description: id, createdBy: 'A', paidBy: 'A', scope: 'PERSONAL', type: 'EXPENSE', status: 'CONFIRMED_SOLID', isSecretGift: false,
  category: 'HEALTH', splitRule: null, partnerAShareCents: amountCents, partnerBShareCents: 0, competenceDate: '2026-11-21', updatedAt: '', ...other,
})
const render = () => renderToStaticMarkup(createElement(FinanceScreen))

beforeEach(() => {
  uiStore.set((state) => ({ ...state, viewer: 'A' }))
  minuteClock.set(() => new Date('2026-11-21T12:00:00Z').getTime())
  dataStore.set(() => buildEmpty(new Date('2026-11-21T12:00:00Z'), 'SOLO'))
})

describe('finanças em um espaço pessoal', () => {
  it('mostra painel único com gastos pessoais, contas e resumo sem abas, privacidade ou acerto', () => {
    dataStore.set((state) => ({ ...state, transactions: {
      próprio: transaction('gasto pessoal autorizado', 3500),
      previsto: transaction('conta prevista própria', 12000, { status: 'PREDICTED_DASHED' }),
      par: transaction('segredo do par excluído', 999999, { createdBy: 'B', paidBy: 'B', isSecretGift: true }),
    } }))
    const html = render()
    expect(html).toContain('data-testid="solo-finance"')
    expect(html).toContain('gasto pessoal autorizado')
    expect(html).toContain('conta prevista própria')
    expect(html).toContain('R$ 35,00')
    expect(html).toContain('R$ 120,00')
    expect(html).toContain('data-testid="rules-PERSONAL"')
    expect(html).not.toContain('segredo do par excluído')
    expect(html).not.toContain('Escopo financeiro')
    expect(html).not.toContain('Encontro de contas')
    expect(html).not.toContain('share-toggle')
  })

  it.each(['A', 'B'] as const)('preserva histórico e divisão original ao usar Solo como %s, sem somar acertos ou o pessoal do par', (viewer) => {
    const partner = otherPartner(viewer)
    uiStore.set((state) => ({ ...state, viewer }))
    const state = buildEmpty(new Date('2026-11-21T12:00:00Z'), 'SOLO', viewer)
    state.couple.couple!.ratioABps = 9000
    state.profiles.A!.displayName = 'Ana'
    state.profiles.B!.displayName = 'Bia'
    state.profiles[partner]!.sharePersonalFinances = true
    state.transactions = {
      own: transaction('gasto próprio preservado', 3500, { createdBy: viewer, paidBy: viewer, partnerAShareCents: viewer === 'A' ? 3500 : 0, partnerBShareCents: viewer === 'B' ? 3500 : 0 }),
      shared: transaction('compra compartilhada original', 10000, { scope: 'COUPLE', createdBy: partner, paidBy: partner, splitRule: 'CUSTOM', partnerAShareCents: 3000, partnerBShareCents: 7000 }),
      settlement: transaction('Acerto do mês', 5400, { type: 'SETTLEMENT', scope: 'COUPLE', createdBy: partner, paidBy: viewer, partnerAShareCents: 0, partnerBShareCents: 0 }),
      partner: transaction('pessoal compartilhado autorizado', 900000, { createdBy: partner, paidBy: partner }),
      gift: transaction('surpresa privada do par', 800000, { createdBy: partner, paidBy: partner, isSecretGift: true }),
      future: transaction('previsto compartilhado', 20000, { status: 'PREDICTED_DASHED', scope: 'COUPLE', createdBy: partner, paidBy: partner, splitRule: 'CUSTOM', partnerAShareCents: 6000, partnerBShareCents: 14000 }),
    }
    const rule: RecurringRule = { id: 'regra-casal', description: 'conta fixa compartilhada original', scope: 'COUPLE', createdBy: partner, paidBy: partner, category: 'HOME', amountCents: 20000, splitRule: '50_50', dayOfMonth: 25, startMonth: '2026-01', endMonth: null, skipMonths: [], updatedAt: '' }
    state.recurrences = { shared: rule, private: { ...rule, id: 'regra-privada', description: 'conta fixa privada do par', scope: 'PERSONAL' } }
    dataStore.set(() => state)
    const before = JSON.stringify(state)
    const html = render()
    const realized = viewer === 'A' ? 'R$ 65,00' : 'R$ 105,00'
    const predicted = viewer === 'A' ? 'R$ 60,00' : 'R$ 140,00'
    expect(html).toContain(`data-testid="solo-realized">${realized}</dd>`)
    expect(html).toContain(`data-testid="solo-predicted">${predicted}</dd>`)
    expect(html).toContain('compra compartilhada original')
    expect(html).toContain('R$ 100,00')
    expect(html).toContain('Divisão personalizada original: Ana')
    expect(html).toContain('R$ 30,00')
    expect(html).toContain('R$ 70,00')
    expect(html).toContain(`Compartilhado · criado por ${partner === 'A' ? 'Ana' : 'Bia'} · pago por ${partner === 'A' ? 'Ana' : 'Bia'}`)
    expect(html).toContain('data-testid="settlement-row"')
    expect(html).toContain('R$ 54,00')
    expect(html).toContain('histórico compartilhado, fora das despesas')
    expect(html).toContain('data-testid="partner-finance-history"')
    expect(html).toContain('pessoal compartilhado autorizado')
    expect(html).toContain('conta fixa compartilhada original')
    expect(html).not.toContain('conta fixa privada do par')
    expect(html).not.toContain('surpresa privada do par')
    expect(JSON.stringify(dataStore.get())).toBe(before)
  })

  it.each(['A', 'B'] as const)('não mostra o pessoal privado do par ou arquivos locais para o dono Solo %s', (viewer) => {
    const partner = otherPartner(viewer)
    uiStore.set((state) => ({ ...state, viewer }))
    const state = buildEmpty(new Date('2026-11-21T12:00:00Z'), 'SOLO', viewer)
    state.profiles[partner]!.sharePersonalFinances = false
    state.transactions = { secret: transaction('pessoal fechado do par', 999999, { createdBy: partner, paidBy: partner }) }
    const collections = Object.fromEntries(COLLECTIONS.map((collection) => [collection, state[collection]])) as unknown as Collections
    state.coupleArchives = [{ savedAt: '', ownerId: viewer, collections: { ...collections, transactions: { archived: transaction('segredo apenas no arquivo', 888888, { createdBy: partner }) } } }]
    dataStore.set(() => state)
    const html = render()
    expect(html).toContain('data-testid="solo-realized">R$ 0,00</dd>')
    expect(html).not.toContain('pessoal fechado do par')
    expect(html).not.toContain('segredo apenas no arquivo')
    expect(html).not.toContain('data-testid="partner-finance-history"')
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
