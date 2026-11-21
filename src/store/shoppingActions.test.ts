import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEmpty } from '../domain/seed'
import type { Medication, ShoppingItem } from '../domain/types'

const toast = vi.fn()
vi.mock('./ui', async () => {
  const { createStore } = await import('./createStore')
  return { uiStore: createStore({ viewer: 'A' }), ui: { toast: (...args: unknown[]) => toast(...args) } }
})

const { dataStore } = await import('./data')
const { uiStore } = await import('./ui')
const { addMedicationToShopping, addShoppingItem, finishShopping, toggleShoppingItem } = await import('./shoppingActions')

const iso = '2026-11-21T10:00:00.000Z'
const medication = (patch: Partial<Medication> = {}): Medication => ({
  id: 'med-1', kind: 'MED', ownerId: 'A', name: 'Vitamina 30', dosage: '1 comprimido', times: ['08:00'], weekdays: [],
  stockCount: 3, lowStockThreshold: 5, notifyPartnerOnDelay: false, delayMinutesThreshold: 30, updatedAt: iso, ...patch,
})
const lastToast = () => toast.mock.calls.at(-1) as [string, { undo?: () => void; action?: { label: string; onClick: () => void } }]
const firstItem = () => Object.values(dataStore.get().shoppingItems)[0]!

beforeEach(() => {
  uiStore.set((s) => ({ ...s, viewer: 'A' }))
  dataStore.set(() => ({ ...buildEmpty(new Date(iso), 'SOLO'), meds: { 'med-1': medication() } }))
  toast.mockClear()
})

describe('estoque e compras', () => {
  it('estoque baixo vira item de farmácia vinculado, com nome completo, outbox e Desfazer', () => {
    expect(addMedicationToShopping('med-1')).toBe(true)
    const item = firstItem()
    expect(item).toMatchObject({ title: 'Vitamina 30', quantity: null, category: 'PHARMACY', sourceMedicationId: 'med-1', checked: false, addedBy: 'A' })
    expect(dataStore.get().outbox.find((e) => e.entityId === item.id)?.payload).toMatchObject({ sourceMedicationId: 'med-1' })
    lastToast()[1].undo!()
    expect(Object.values(dataStore.get().shoppingItems)).toHaveLength(0)
  })

  it('renomear o remédio não duplica uma reposição que continua aberta', () => {
    addMedicationToShopping('med-1')
    dataStore.set((s) => ({ ...s, meds: { 'med-1': { ...s.meds['med-1']!, name: 'Nome atualizado' } } }))
    expect(addMedicationToShopping('med-1')).toBe(false)
    expect(Object.values(dataStore.get().shoppingItems)).toHaveLength(1)
  })

  it('vincula uma linha manual já aberta sem duplicar e Desfazer preserva o pedido original', () => {
    addShoppingItem('vitamina 30', 'OTHER')
    // Uma linha de remédio é título livre; a quantidade de compra não altera o vínculo.
    const manual = { ...firstItem(), title: 'Vitamina 30' }
    dataStore.set((s) => ({ ...s, shoppingItems: { [manual.id]: manual } }))
    expect(addMedicationToShopping('med-1')).toBe(true)
    expect(Object.values(dataStore.get().shoppingItems)).toHaveLength(1)
    expect(firstItem()).toMatchObject({ sourceMedicationId: 'med-1', category: 'PHARMACY' })
    lastToast()[1].undo!()
    expect(firstItem()).toEqual(manual)
  })

  it('não cria reposição de remédio alheio ou sem estoque baixo', () => {
    dataStore.set((s) => ({ ...s, meds: { 'med-1': medication({ ownerId: 'B' }) } }))
    expect(addMedicationToShopping('med-1')).toBe(false)
    dataStore.set((s) => ({ ...s, meds: { 'med-1': medication({ stockCount: 50 }) } }))
    expect(addMedicationToShopping('med-1')).toBe(false)
    expect(Object.values(dataStore.get().shoppingItems)).toHaveLength(0)
  })

  it('comprar remédio oferece reposição, executa uma vez e permite desfazer o estoque', () => {
    addMedicationToShopping('med-1')
    toggleShoppingItem(firstItem().id)
    const action = lastToast()[1].action!
    expect(action.label).toBe('Repor estoque')
    expect(dataStore.get().meds['med-1']!.stockCount).toBe(3)
    action.onClick()
    expect(dataStore.get().meds['med-1']!.stockCount).toBe(33)
    expect(firstItem().checked).toBe(true)
    const undoStock = lastToast()[1].undo!
    action.onClick()
    expect(dataStore.get().meds['med-1']!.stockCount).toBe(33)
    undoStock()
    expect(dataStore.get().meds['med-1']!.stockCount).toBe(3)
  })

  it('cartela repõe o número de comprimidos pelos horários do medicamento', () => {
    dataStore.set((s) => ({ ...s, meds: { 'med-1': medication({ times: ['08:00', '20:00'], pack: { activeDays: 21, pauseDays: 7, startDate: '2026-11-01' } }) } }))
    addMedicationToShopping('med-1')
    toggleShoppingItem(firstItem().id)
    lastToast()[1].action!.onClick()
    expect(dataStore.get().meds['med-1']!.stockCount).toBe(45)
  })

  it('desfazer a compra impede que uma ação antiga reponha o estoque', () => {
    addMedicationToShopping('med-1')
    toggleShoppingItem(firstItem().id)
    const { undo, action } = lastToast()[1]
    undo!()
    action!.onClick()
    expect(firstItem().checked).toBe(false)
    expect(dataStore.get().meds['med-1']!.stockCount).toBe(3)
  })

  it('uma reposição comprada não impede um novo pedido aberto', () => {
    addMedicationToShopping('med-1')
    toggleShoppingItem(firstItem().id)
    expect(addMedicationToShopping('med-1')).toBe(true)
    expect(Object.values(dataStore.get().shoppingItems).filter((i) => !i.checked)).toHaveLength(1)
  })

  it('terminar a compra preserva itens pendentes e Desfazer restaura os comprados', () => {
    addMedicationToShopping('med-1')
    toggleShoppingItem(firstItem().id)
    const purchased: ShoppingItem = firstItem()
    addShoppingItem('Arroz', 'MARKET')
    expect(finishShopping()).toBe(1)
    expect(Object.values(dataStore.get().shoppingItems).map((i) => i.title)).toEqual(['Arroz'])
    lastToast()[1].undo!()
    expect(dataStore.get().shoppingItems[purchased.id]).toEqual(purchased)
  })
})
