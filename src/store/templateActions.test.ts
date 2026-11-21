import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEmpty } from '../domain/seed'
import { MAX_COMFORT } from '../domain/mood'
import type { ShoppingItem } from '../domain/types'

const toast = vi.fn()
vi.mock('./ui', async () => {
  const { createStore } = await import('./createStore')
  return { uiStore: createStore({ viewer: 'B' }), ui: { toast: (...args: unknown[]) => toast(...args) } }
})
const { dataStore, transact } = await import('./data')
const { applyTemplate } = await import('./templateActions')
const now = new Date('2026-11-21T14:00:00Z')
const undo = () => (toast.mock.calls.at(-1)![1] as { undo: () => void }).undo()
const item = (id: string, title: string): ShoppingItem => ({ id, title, category: 'MARKET', quantity: '2 kg', addedBy: 'A', checked: false, checkedBy: null, sourceMedicationId: null, createdAt: now.toISOString(), updatedAt: now.toISOString() })

beforeEach(() => {
  dataStore.set(() => buildEmpty(now, 'SOLO'))
  toast.mockClear()
})

describe('modelos em um toque', () => {
  it('rotina entra para o viewer com outbox e Desfazer, sem medicamento nem convite de apoio', () => {
    expect(applyTemplate('routine-water')).toBe(1)
    const routines = Object.values(dataStore.get().meds)
    expect(routines).toHaveLength(1)
    expect(routines[0]).toMatchObject({ kind: 'ROUTINE', name: 'Beber água', ownerId: null, assignee: 'B', notifyPartnerOnDelay: false, stockCount: null, times: ['10:00'] })
    expect(dataStore.get().outbox).toEqual([expect.objectContaining({ entityType: 'meds', entityId: routines[0]!.id, operation: 'UPSERT' })])
    expect(toast).toHaveBeenCalledTimes(1)
    undo()
    expect(dataStore.get().meds[routines[0]!.id]).toBeUndefined()
  })

  it('repetir um toque não duplica a rotina nem substitui ajustes existentes', () => {
    applyTemplate('routine-water')
    const first = Object.values(dataStore.get().meds)[0]!
    dataStore.set((state) => ({ ...state, meds: { ...state.meds, [first.id]: { ...first, times: ['11:30'] } } }))
    const previous = dataStore.get()
    expect(applyTemplate('routine-water')).toBe(0)
    expect(dataStore.get()).toBe(previous)
    expect(dataStore.get().meds[first.id]!.times).toEqual(['11:30'])
  })

  it('kit guarda só no nome do viewer e desfaz o modelo inteiro de uma vez', () => {
    expect(applyTemplate('comfort-grounding')).toBe(2)
    const items = Object.values(dataStore.get().comfortItems)
    expect(items.every((entry) => entry.ownerId === 'B')).toBe(true)
    expect(dataStore.get().comfortItems).toHaveProperty(items[0]!.id)
    expect(dataStore.get().outbox.filter((entry) => entry.entityType === 'comfortItems')).toHaveLength(2)
    expect(toast).toHaveBeenCalledTimes(1)
    undo()
    expect(Object.values(dataStore.get().comfortItems)).toEqual([])
  })

  it('lista base preserva item existente e Desfazer tira só os itens criados pelo modelo', () => {
    const existing = item('existing', 'Arroz')
    dataStore.set((state) => ({ ...state, shoppingItems: { existing } }))
    expect(applyTemplate('shopping-basics')).toBe(5)
    const created = Object.values(dataStore.get().shoppingItems).filter((entry) => entry.id !== 'existing')
    expect(new Set(created.map((entry) => entry.id)).size).toBe(5)
    expect(created.every((entry) => entry.addedBy === 'B' && !entry.checked)).toBe(true)
    expect(dataStore.get().shoppingItems.existing).toBe(existing)
    expect(toast).toHaveBeenCalledTimes(1)
    const unrelated = item('unrelated', 'Café')
    transact((tx) => tx.put('shoppingItems', unrelated))
    undo()
    expect(dataStore.get().shoppingItems).toEqual({ existing, unrelated })
  })

  it('kit cheio recebe só o que ainda cabe e não muda os itens anteriores', () => {
    dataStore.set((state) => ({ ...state, comfortItems: Object.fromEntries(Array.from({ length: MAX_COMFORT - 1 }, (_, index) => [String(index), { id: String(index), text: `Ideia minha ${index}`, ownerId: 'B', createdAt: '', updatedAt: '' }])) }))
    const previous = dataStore.get().comfortItems
    expect(applyTemplate('comfort-grounding')).toBe(1)
    expect(Object.values(dataStore.get().comfortItems)).toHaveLength(MAX_COMFORT)
    for (const [id, entry] of Object.entries(previous)) expect(dataStore.get().comfortItems[id]).toBe(entry)
    undo()
    expect(dataStore.get().comfortItems).toEqual(previous)
  })

  it('modelo desconhecido ou módulo de compras desligado não grava nada', () => {
    dataStore.set((state) => ({ ...state, profiles: { ...state.profiles, B: { ...state.profiles.B!, enabledModules: { cycle: false, shopping: false, goals: true } } } }))
    const previous = dataStore.get()
    expect(applyTemplate('desconhecido')).toBe(0)
    expect(applyTemplate('shopping-basics')).toBe(0)
    expect(dataStore.get()).toBe(previous)
    expect(dataStore.get().profiles.B!.enabledModules!.shopping).toBe(false)
  })
})
