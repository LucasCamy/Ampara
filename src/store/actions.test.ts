import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEmpty } from '../domain/seed'

// ui.ts toca no document (tema); aqui basta quem está usando e o Toast
const toast = vi.fn()
vi.mock('./ui', async () => {
  const { createStore } = await import('./createStore')
  return { uiStore: createStore({ viewer: 'B' }), ui: { toast: (...a: unknown[]) => toast(...a) } }
})

const { dataStore } = await import('./data')
const { addEvent, addMedication, addRoutine } = await import('./actions')

const lastToast = () => toast.mock.calls.at(-1) as [string, { undo?: () => void }]

beforeEach(() => {
  dataStore.set(() => buildEmpty(new Date('2026-11-06T12:00:00Z')))
  toast.mockClear()
})

describe('actions de cadastro', () => {
  it('addMedication grava no nome do viewer da sessão, enfileira no outbox e permite desfazer', () => {
    const id = addMedication({ name: 'Venvanse 30mg', dosage: '1 cápsula', times: ['08:00'], stock: '30', shareWithPartner: true })
    expect(id).toBeTruthy()
    const s = dataStore.get()
    expect(s.meds[id!]).toMatchObject({ kind: 'MED', ownerId: 'B', notifyPartnerOnDelay: true, stockCount: 30 })
    expect(s.outbox.some((e) => e.entityType === 'meds' && e.entityId === id && e.status === 'PENDING')).toBe(true)

    const [msg, opts] = lastToast()
    expect(msg).toContain('Venvanse 30mg')
    expect(opts.undo).toBeTypeOf('function')
    opts.undo!()
    expect(dataStore.get().meds[id!]).toBeUndefined()
  })

  it('entrada inválida não grava nada nem mostra Toast', () => {
    const before = dataStore.get()
    expect(addMedication({ name: '', dosage: '', times: ['99:99'], stock: '', shareWithPartner: false })).toBeNull()
    expect(addRoutine({ title: '', times: ['20:00'], weekdays: [], instruction: '', responsible: 'ANY', stock: '', stockUnit: '' })).toBeNull()
    expect(addEvent({ title: 'Jantar', date: '2026-11-10', start: '20:00', end: '19:00', owner: 'US', type: 'APPOINTMENT' })).toBeNull()
    expect(dataStore.get()).toBe(before)
    expect(toast).not.toHaveBeenCalled()
  })

  it('addRoutine cria rotina sem dono (qualquer um confirma) e enfileira em meds', () => {
    const id = addRoutine({ title: 'Tirar o lixo', times: ['21:00'], weekdays: [1, 3, 5], instruction: '', responsible: 'PARTNER', stock: '', stockUnit: '' })
    const r = dataStore.get().meds[id!]
    expect(r).toMatchObject({ kind: 'ROUTINE', ownerId: null, assignee: 'A', weekdays: [1, 3, 5], times: ['21:00'] })
    expect(dataStore.get().outbox.filter((e) => e.entityId === id)).toHaveLength(1)
    lastToast()[1].undo!()
    expect(dataStore.get().meds[id!]).toBeUndefined()
  })

  it('addEvent cria compromisso do casal ou pessoal e enfileira em events', () => {
    const us = addEvent({ title: 'Jantar de aniversário', date: '2026-11-20', start: '20:00', end: '22:30', owner: 'US', type: 'APPOINTMENT' })
    const mine = addEvent({ title: 'Conta de luz', date: '2026-11-15', start: '09:00', end: '09:30', owner: 'ME', type: 'BILL' })
    const s = dataStore.get()
    expect(s.events[us!]).toMatchObject({ kind: 'COUPLE', ownerId: null })
    expect(s.events[mine!]).toMatchObject({ kind: 'BILL', ownerId: 'B' })
    expect(s.outbox.filter((e) => e.entityType === 'events')).toHaveLength(2)
    expect(lastToast()[0]).toBe('Compromisso salvo · 15/11 das 09:00 às 09:30')
  })
})

describe('editar e excluir', () => {
  const medInput = { name: 'Venvanse 30mg', dosage: '1 cápsula', times: ['08:00'], stock: '30', shareWithPartner: false }

  it('saveMedication com id edita o mesmo registro, enfileira e desfaz para a versão anterior', async () => {
    const { saveMedication } = await import('./actions')
    const id = saveMedication(medInput)!
    const edited = saveMedication({ ...medInput, times: ['08:00', '20:00'], dosage: '2 cápsulas' }, id)
    expect(edited).toBe(id)
    expect(Object.keys(dataStore.get().meds)).toHaveLength(1)
    expect(dataStore.get().meds[id]).toMatchObject({ dosage: '2 cápsulas', times: ['08:00', '20:00'] })
    expect(lastToast()[0]).toBe('Remédio atualizado · Venvanse 30mg')
    lastToast()[1].undo!()
    expect(dataStore.get().meds[id]).toMatchObject({ dosage: '1 cápsula', times: ['08:00'] })
  })

  it('não edita nem exclui remédio do par', async () => {
    const { saveMedication, deleteMedication } = await import('./actions')
    const { uiStore } = await import('./ui')
    const id = saveMedication(medInput)! // dono: B (viewer do mock)
    uiStore.set((s) => ({ ...s, viewer: 'A' }))
    try {
      expect(saveMedication({ ...medInput, name: 'trocado' }, id)).toBeNull()
      expect(deleteMedication(id)).toBe(false)
      expect(dataStore.get().meds[id]?.name).toBe('Venvanse 30mg')
    } finally {
      uiStore.set((s) => ({ ...s, viewer: 'B' }))
    }
  })

  it('excluir remédio, rotina e compromisso: some na hora, vai para a fila como DELETE e Desfazer devolve', async () => {
    const { deleteEvent, deleteMedication, saveEvent, saveRoutine } = await import('./actions')
    const rid = saveRoutine({ title: 'Lixo', times: ['20:00'], weekdays: [], instruction: '', responsible: 'ANY', stock: '', stockUnit: '' })!
    expect(deleteMedication(rid)).toBe(true)
    expect(dataStore.get().meds[rid]).toBeUndefined()
    expect(dataStore.get().outbox.some((e) => e.entityId === rid && e.operation === 'DELETE')).toBe(true)
    expect(lastToast()[0]).toBe('Rotina excluída · Lixo')
    lastToast()[1].undo!()
    expect(dataStore.get().meds[rid]?.name).toBe('Lixo')

    const eid = saveEvent({ title: 'Dentista', date: '2026-11-12', start: '10:00', end: '11:00', owner: 'ME', type: 'HEALTH' })!
    expect(deleteEvent(eid)).toBe(true)
    expect(dataStore.get().events[eid]).toBeUndefined()
    expect(deleteEvent(eid)).toBe(false)
  })
})
