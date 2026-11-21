import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEmpty } from '../domain/seed'
import type { PartnerId, ShoppingItem } from '../domain/types'
import { monthOf, shiftMonth } from '../domain/ledger'
import { toDateKey } from '../domain/dates'

const toast = vi.fn()
vi.mock('./ui', async () => {
  const { createStore } = await import('./createStore')
  return { uiStore: createStore({ viewer: 'A' as PartnerId }), ui: { toast: (...args: unknown[]) => toast(...args) } }
})

const { dataStore } = await import('./data')
const { uiStore } = await import('./ui')
const { MAX_MONTHLY_BUDGET_CENTS, createRuleFromTransaction, getRuleSourceTransaction, saveEntry, setMonthlyBudgetCents } = await import('./financeActions')

const lastUndo = () => (toast.mock.calls.at(-1) as [string, { undo: () => void }])[1].undo
const expense = {
  amountCents: 3500,
  description: 'Farmácia',
  category: 'HEALTH',
  scope: 'COUPLE',
  paidBy: 'B',
  splitRule: 'PROPORTIONAL',
  isSecretGift: true,
  status: 'CONFIRMED_SOLID',
  date: '2026-11-21',
  repeat: 'ONCE',
} as const

beforeEach(() => {
  dataStore.set(() => buildEmpty(new Date('2026-11-21T12:00:00Z'), 'SOLO'))
  uiStore.set((state) => ({ ...state, viewer: 'A' }))
  toast.mockClear()
})

describe('conta fixa a partir de sugestão', () => {
  const source = () => {
    saveEntry({ ...expense, description: 'Assinatura', category: 'OTHER', isSecretGift: false, date: toDateKey(new Date()) })
    return Object.values(dataStore.get().transactions)[0]!
  }
  const input = { description: 'Assinatura', amountCents: 3500, dayOfMonth: 12 }

  it('cria previsões a partir do próximo mês, preservando gasto pago e privacidade Solo', () => {
    const paid = source()
    expect(createRuleFromTransaction(paid.id, input)).toBe(true)
    const state = dataStore.get()
    const rule = Object.values(state.recurrences)[0]!
    expect(rule).toMatchObject({ scope: 'PERSONAL', createdBy: 'A', paidBy: 'A', splitRule: null, startMonth: shiftMonth(monthOf(toDateKey(new Date())), 1), amountCents: 3500 })
    expect(state.transactions[paid.id]).toBe(paid)
    const future = Object.values(state.transactions).filter((tx) => tx.recurrenceId === rule.id)
    expect(future.length).toBeGreaterThan(0)
    expect(future.every((tx) => tx.status === 'PREDICTED_DASHED' && monthOf(tx.competenceDate) >= rule.startMonth)).toBe(true)
    expect(state.outbox.some((entry) => entry.entityType === 'recurrences' && entry.entityId === rule.id)).toBe(true)
    lastUndo()()
    expect(dataStore.get().recurrences).toEqual({})
    expect(dataStore.get().transactions).toEqual({ [paid.id]: paid })
  })

  it('não duplica uma conta equivalente se o botão for acionado de novo', () => {
    const paid = source()
    expect(createRuleFromTransaction(paid.id, input)).toBe(true)
    const before = dataStore.get()
    expect(createRuleFromTransaction(paid.id, { ...input, description: 'ASSINATURA' })).toBe(false)
    expect(dataStore.get()).toBe(before)
  })

  it('uma transação pessoal do par não vira conta minha mesmo com leitura compartilhada', () => {
    dataStore.set(() => buildEmpty(new Date(), 'COUPLE'))
    uiStore.set((state) => ({ ...state, viewer: 'B' }))
    saveEntry({ ...expense, scope: 'PERSONAL', isSecretGift: false })
    const paid = Object.values(dataStore.get().transactions)[0]!
    dataStore.set((state) => ({ ...state, profiles: { ...state.profiles, B: { ...state.profiles.B!, sharePersonalFinances: true } } }))
    uiStore.set((state) => ({ ...state, viewer: 'A' }))
    const before = dataStore.get()
    expect(getRuleSourceTransaction(paid.id)).toBeNull()
    expect(createRuleFromTransaction(paid.id, input)).toBe(false)
    expect(dataStore.get()).toBe(before)
  })

  it.each([{ amountCents: 0 }, { amountCents: 10.5 }, { dayOfMonth: 32 }, { description: ' ' }])('entrada inválida não altera os dados: %o', (patch) => {
    const paid = source()
    const before = dataStore.get()
    expect(createRuleFromTransaction(paid.id, { ...input, ...patch })).toBe(false)
    expect(dataStore.get()).toBe(before)
  })

  it('presentes e parcelas não originam contas recorrentes por esse atalho', () => {
    const paid = source()
    for (const patch of [{ isSecretGift: true }, { installmentGroup: 'grupo' }, { recurrenceId: 'regra' }]) {
      dataStore.set((state) => ({ ...state, transactions: { [paid.id]: { ...paid, ...patch } } }))
      expect(getRuleSourceTransaction(paid.id)).toBeNull()
      expect(createRuleFromTransaction(paid.id, input)).toBe(false)
    }
  })
})

describe('teto mensal pessoal', () => {
  it('salva centavos somente no perfil do viewer, enfileira e Desfazer recupera o orçamento', () => {
    uiStore.set((state) => ({ ...state, viewer: 'B' }))
    const before = dataStore.get()
    expect(setMonthlyBudgetCents(175050)).toBe(true)
    const after = dataStore.get()
    expect(after.profiles.B!.monthlyBudgetCents).toBe(175050)
    expect(after.profiles.A).toBe(before.profiles.A)
    expect(after.profiles.B!.enabledModules).toEqual(before.profiles.B!.enabledModules)
    expect(after.outbox.some((entry) => entry.entityType === 'profiles' && entry.entityId === 'B' && entry.operation === 'UPSERT')).toBe(true)
    lastUndo()()
    expect(dataStore.get().profiles.B!.monthlyBudgetCents).toBeNull()
  })

  it.each([-1, 10.5, NaN, Infinity, MAX_MONTHLY_BUDGET_CENTS + 1])('não grava valor inválido em centavos: %s', (cents) => {
    const before = dataStore.get()
    expect(setMonthlyBudgetCents(cents)).toBe(false)
    expect(dataStore.get()).toBe(before)
    expect(toast).not.toHaveBeenCalled()
  })

  it('aceita zero e o limite integer, e permite remover o teto com Desfazer', () => {
    expect(setMonthlyBudgetCents(0)).toBe(true)
    expect(dataStore.get().profiles.A!.monthlyBudgetCents).toBe(0)
    expect(setMonthlyBudgetCents(MAX_MONTHLY_BUDGET_CENTS)).toBe(true)
    expect(setMonthlyBudgetCents(null)).toBe(true)
    expect(dataStore.get().profiles.A!.monthlyBudgetCents).toBeNull()
    lastUndo()()
    expect(dataStore.get().profiles.A!.monthlyBudgetCents).toBe(MAX_MONTHLY_BUDGET_CENTS)
  })

  it('não cria escrita nem Toast quando o valor não muda ou o perfil não existe', () => {
    const before = dataStore.get()
    expect(setMonthlyBudgetCents(null)).toBe(true)
    expect(dataStore.get()).toBe(before)
    dataStore.set((state) => ({ ...state, profiles: {} }))
    expect(setMonthlyBudgetCents(1000)).toBe(false)
    expect(toast).not.toHaveBeenCalled()
  })
})

describe('captura financeira Solo e compras', () => {
  it.each(['ONCE', 'MONTHLY', 'INSTALLMENTS'] as const)('Solo sempre grava pessoal e por quem está na sessão (%s)', (repeat) => {
    expect(saveEntry({ ...expense, repeat, installments: 2 })).toBe(true)
    const state = dataStore.get()
    expect(Object.values(state.transactions).length).toBeGreaterThan(0)
    for (const tx of Object.values(state.transactions)) {
      expect(tx).toMatchObject({ scope: 'PERSONAL', createdBy: 'A', paidBy: 'A', splitRule: null, isSecretGift: false, partnerBShareCents: 0 })
      expect(tx.partnerAShareCents).toBe(tx.amountCents)
    }
    for (const rule of Object.values(state.recurrences)) expect(rule).toMatchObject({ scope: 'PERSONAL', createdBy: 'A', paidBy: 'A', splitRule: null })
  })

  it('preserva divisão e quem pagou no modo Casal', () => {
    dataStore.set(() => buildEmpty(new Date('2026-11-21T12:00:00Z')))
    saveEntry(expense)
    expect(Object.values(dataStore.get().transactions)[0]).toMatchObject({ scope: 'COUPLE', paidBy: 'B', splitRule: 'PROPORTIONAL', isSecretGift: false })
  })

  it.each(['ONCE', 'MONTHLY', 'INSTALLMENTS'] as const)('limpa só compras escolhidas ainda marcadas e Desfazer restaura gasto e lista (%s)', (repeat) => {
    const item = (id: string, checked: boolean): ShoppingItem => ({ id, title: id, quantity: null, category: 'MARKET', addedBy: 'A', checked, checkedBy: checked ? 'A' : null, sourceMedicationId: null, createdAt: '', updatedAt: '' })
    const items = { comprado: item('comprado', true), desmarcado: item('desmarcado', false), outro: item('outro', true) }
    dataStore.set((state) => ({ ...state, shoppingItems: items }))
    saveEntry({ ...expense, repeat, installments: 2, checkedShoppingIds: ['comprado', 'desmarcado', 'não existe', 'comprado'] })
    expect(dataStore.get().shoppingItems.comprado).toBeUndefined()
    expect(dataStore.get().shoppingItems.desmarcado).toEqual(items.desmarcado)
    expect(dataStore.get().shoppingItems.outro).toEqual(items.outro)
    expect(Object.values(dataStore.get().transactions).length).toBeGreaterThan(0)
    expect(toast).toHaveBeenCalledTimes(1)
    lastUndo()()
    expect(dataStore.get().shoppingItems).toEqual(items)
    expect(dataStore.get().transactions).toEqual({})
    expect(dataStore.get().recurrences).toEqual({})
  })
})
