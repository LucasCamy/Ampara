import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toDateKey, addDays } from '../domain/dates'
import { buildEmpty } from '../domain/seed'
import type { Task } from '../domain/types'

const toast = vi.fn()
vi.mock('./ui', async () => {
  const { createStore } = await import('./createStore')
  return { uiStore: createStore({ viewer: 'A' }), ui: { toast: (...args: unknown[]) => toast(...args) } }
})
const { dataStore } = await import('./data')
const { reliefToday, movePendingToTomorrow, startUnstuckFocus } = await import('./unstuckActions')
const now = new Date('2026-11-21T14:00:00Z')
const today = toDateKey(now)
const undo = () => (toast.mock.calls.at(-1)![1] as { undo: () => void }).undo()
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id, title: id, assignedTo: 'A', createdBy: 'A', status: 'PENDING', effort: 'QUICK_5M', dueDate: today, dueTime: null,
  visibleToPartner: false, sentBy: null, completedAt: null, completedBy: null, sourceMedicationId: null,
  steps: [], postponeCount: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), ...extra,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  dataStore.set(() => buildEmpty(now, 'SOLO'))
  toast.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('aliviar o dia com Desfazer', () => {
  it('adia só minhas pendências sem horário e as compartilhadas, mantendo urgentes e a tarefa escolhida', () => {
    const tasks = [
      task('minha', { postponeCount: 2, steps: [{ id: 'passo', text: 'Abrir', done: true }] }),
      task('atrasada', { dueDate: addDays(today, -2) }), task('compartilhada', { assignedTo: null }),
      task('horario', { dueTime: '15:00' }), task('escolhida'), task('par', { assignedTo: 'B', visibleToPartner: true }),
      task('entrada', { dueDate: null }), task('futura', { dueDate: addDays(today, 2) }), task('feita', { status: 'DONE' }), task('arquivada', { status: 'ARCHIVED' }),
    ]
    dataStore.set((state) => ({ ...state, tasks: Object.fromEntries(tasks.map((item) => [item.id, item])) }))
    const previous = dataStore.get()
    expect(reliefToday('escolhida')).toBe(3)
    const state = dataStore.get()
    expect(state.profiles.A!.energy).toBe('OVERLOAD')
    expect(state.profiles.B).toBe(previous.profiles.B)
    expect(state.tasks.minha).toMatchObject({ dueDate: addDays(today, 1), postponeCount: 3, steps: [{ id: 'passo', text: 'Abrir', done: true }] })
    for (const id of ['horario', 'escolhida', 'par', 'entrada', 'futura', 'feita', 'arquivada']) expect(state.tasks[id]).toBe(previous.tasks[id])
    expect(state.outbox.filter((entry) => entry.entityType === 'tasks')).toHaveLength(3)
    undo()
    expect(dataStore.get().tasks).toEqual(previous.tasks)
    expect(dataStore.get().profiles.A).toEqual(previous.profiles.A)
  })

  it('fechamento move também pendências com horário, sem mudar a bateria nem tarefas do par', () => {
    dataStore.set((state) => ({ ...state, tasks: { minha: task('minha'), horario: task('horario', { dueTime: '08:00', postponeCount: 1 }), par: task('par', { assignedTo: 'B', visibleToPartner: true }) } }))
    const previous = dataStore.get()
    expect(movePendingToTomorrow()).toBe(2)
    expect(dataStore.get().tasks.horario).toMatchObject({ dueDate: addDays(today, 1), dueTime: '08:00', postponeCount: 2 })
    expect(dataStore.get().profiles.A).toBe(previous.profiles.A)
    expect(dataStore.get().tasks.par).toBe(previous.tasks.par)
    undo()
    expect(dataStore.get().tasks).toEqual(previous.tasks)
  })
})

describe('Travei inicia um foco individual', () => {
  it('micro-passo novo e foco de cinco minutos são salvos e desfeitos juntos', () => {
    const id = startUnstuckFocus({ taskId: null, title: 'Um começo', microStep: ' Pegar uma folha ' })!
    const focus = dataStore.get().focusSessions[id]!
    const created = dataStore.get().tasks[focus.taskId!]!
    expect(focus).toMatchObject({ title: 'Pegar uma folha', durationMin: 5, startedBy: 'A', joinedBy: 'A', endsAt: '2026-11-21T14:05:00.000Z' })
    expect(created).toMatchObject({ title: 'Pegar uma folha', dueDate: today, assignedTo: 'A', visibleToPartner: false, steps: [{ text: 'Pegar uma folha', done: false }] })
    undo()
    expect(dataStore.get().tasks[created.id]).toBeUndefined()
    expect(dataStore.get().focusSessions[id]).toBeUndefined()
  })

  it('adiciona apenas um micro-passo e preserva os que já foram feitos', () => {
    dataStore.set((state) => ({ ...state, tasks: { alvo: task('alvo', { steps: [{ id: 'feito', text: 'Separar a pasta', done: true }] }) } }))
    const previous = dataStore.get().tasks.alvo!
    const focusId = startUnstuckFocus({ taskId: 'alvo', title: 'alvo', microStep: 'Abrir uma folha' })!
    expect(dataStore.get().tasks.alvo!.steps).toHaveLength(2)
    expect(dataStore.get().tasks.alvo!.steps![0]).toEqual(previous.steps![0])
    expect(dataStore.get().focusSessions[focusId]).toMatchObject({ taskId: 'alvo', title: 'Abrir uma folha' })
    undo()
    expect(dataStore.get().tasks.alvo).toEqual(previous)
  })

  it('não duplica um passo pendente nem passa do limite de três passos', () => {
    const steps = [{ id: 'um', text: 'Abrir', done: false }, { id: 'dois', text: 'Pegar', done: false }, { id: 'tres', text: 'Ler', done: false }]
    dataStore.set((state) => ({ ...state, tasks: { alvo: task('alvo', { steps }) } }))
    expect(startUnstuckFocus({ taskId: 'alvo', title: 'alvo', microStep: 'Abrir' })).toBeTruthy()
    expect(dataStore.get().tasks.alvo!.steps).toEqual(steps)
    expect(startUnstuckFocus({ taskId: 'alvo', title: 'alvo', microStep: 'Algo pequeno novo' })).toBeTruthy()
    expect(dataStore.get().tasks.alvo!.steps).toEqual(steps)
  })

  it('não modifica tarefa do par e não salva micro-passo vazio', () => {
    dataStore.set((state) => ({ ...state, tasks: { par: task('par', { assignedTo: 'B', visibleToPartner: true }) } }))
    const previous = dataStore.get()
    expect(startUnstuckFocus({ taskId: 'par', title: 'Tarefa do par', microStep: 'Primeiro passo' })).toBeNull()
    expect(startUnstuckFocus({ taskId: null, title: 'Um começo', microStep: ' ' })).toBeNull()
    expect(dataStore.get()).toBe(previous)
    expect(toast).not.toHaveBeenCalled()
  })
})
