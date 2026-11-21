import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEmpty } from '../domain/seed'
import type { Task } from '../domain/types'

const toast = vi.fn()
vi.mock('./ui', async () => {
  const { createStore } = await import('./createStore')
  return { uiStore: createStore({ viewer: 'A' }), ui: { toast: (...args: unknown[]) => toast(...args) } }
})
const { dataStore } = await import('./data')
const { uiStore } = await import('./ui')
const { cancelFocus, extendFocus, finishFocus, joinFocus, pauseFocus, startFocus, toggleTaskStep } = await import('./togetherActions')
const now = new Date('2026-11-21T14:00:00Z')
const undo = () => (toast.mock.calls.at(-1)![1] as { undo: () => void }).undo()
const task = (steps: Task['steps'] = []): Task => ({
  id: 'tarefa', title: 'Organizar documentos', createdBy: 'A', assignedTo: 'A', status: 'PENDING', effort: 'FOCUS',
  dueDate: '2026-11-21', dueTime: null, visibleToPartner: true, sentBy: null, completedAt: null, completedBy: null,
  sourceMedicationId: null, steps, postponeCount: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(),
})
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  uiStore.set((state) => ({ ...state, viewer: 'A' }))
  dataStore.set(() => buildEmpty(now, 'SOLO'))
  toast.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('foco individual e em casal', () => {
  it('no Casal, tarefa privada mantém o foco individual e não permite ações do par em uma cópia antiga', () => {
    dataStore.set(() => ({ ...buildEmpty(now), tasks: { tarefa: { ...task(), visibleToPartner: false } } }))
    const focus = startFocus('Organizar documentos privados', 5, 'tarefa')!
    expect(dataStore.get().focusSessions[focus]!.joinedBy).toBe('A')
    expect(toast.mock.calls.at(-1)![0]).not.toContain('par foi chamado')
    // Uma versão anterior tinha criado um foco conjunto com esse título privado.
    dataStore.set((state) => ({ ...state, focusSessions: { [focus]: { ...state.focusSessions[focus]!, joinedBy: null } } }))
    uiStore.set((state) => ({ ...state, viewer: 'B' }))
    const before = dataStore.get()
    joinFocus(focus)
    finishFocus(focus)
    cancelFocus(focus)
    pauseFocus(focus)
    expect(extendFocus(focus)).toBe(false)
    expect(dataStore.get()).toBe(before)
  })
  it('Solo começa sem chamar o par e Desfazer recupera uma sessão anterior', () => {
    const first = startFocus('Abrir a pasta', 5)!
    expect(dataStore.get().focusSessions[first]).toMatchObject({ startedBy: 'A', joinedBy: 'A', durationMin: 5, status: 'RUNNING' })
    expect(toast.mock.calls.at(-1)![0]).not.toContain('par')
    const next = startFocus('Ler uma página', 15)!
    expect(dataStore.get().focusSessions[first]!.status).toBe('CANCELLED')
    undo()
    expect(dataStore.get().focusSessions[first]!.status).toBe('RUNNING')
    expect(dataStore.get().focusSessions[next]).toBeUndefined()
  })

  it('Casal mantém o convite normal e pode escolher um foco sem chamar o par', () => {
    dataStore.set(() => buildEmpty(now))
    const together = startFocus('Lavar a louça', 25)!
    expect(dataStore.get().focusSessions[together]!.joinedBy).toBeNull()
    const alone = startFocus('Separar roupas', 5, null, true)!
    expect(dataStore.get().focusSessions[alone]!.joinedBy).toBe('A')
    expect(toast.mock.calls.at(-1)![0]).not.toContain('chamado')
  })

  it('terminar micro-passo marca só um passo e mantém a tarefa pendente', () => {
    dataStore.set((state) => ({ ...state, tasks: { tarefa: task([{ id: 'um', text: 'Abrir a pasta', done: false }, { id: 'dois', text: 'Ler uma página', done: false }]) } }))
    const focus = startFocus('Abrir a pasta', 5, 'tarefa')!
    finishFocus(focus)
    expect(dataStore.get().focusSessions[focus]!.status).toBe('DONE')
    expect(dataStore.get().tasks.tarefa).toMatchObject({ status: 'PENDING', steps: [{ id: 'um', done: true }, { id: 'dois', done: false }] })
    undo()
    expect(dataStore.get().focusSessions[focus]!.status).toBe('RUNNING')
    expect(dataStore.get().tasks.tarefa!.steps!.every((step) => !step.done)).toBe(true)
  })

  it('passos com texto repetido não são todos concluídos de uma vez', () => {
    dataStore.set((state) => ({ ...state, tasks: { tarefa: task([{ id: 'um', text: 'Uma folha', done: false }, { id: 'dois', text: 'Uma folha', done: false }]) } }))
    const focus = startFocus('Uma folha', 5, 'tarefa')!
    finishFocus(focus)
    expect(dataStore.get().tasks.tarefa!.steps!.map((step) => step.done)).toEqual([true, false])
  })

  it('nome da tarefa não presume passos feitos; checklist confirma antes de concluir', () => {
    dataStore.set((state) => ({ ...state, tasks: { tarefa: task([{ id: 'um', text: 'Abrir', done: false }]) } }))
    const focus = startFocus('Organizar documentos', 5, 'tarefa')!
    finishFocus(focus)
    expect(dataStore.get().tasks.tarefa!.status).toBe('PENDING')
    toggleTaskStep('tarefa', 'um')
    const next = startFocus('Organizar documentos', 5, 'tarefa')!
    finishFocus(next)
    expect(dataStore.get().tasks.tarefa).toMatchObject({ status: 'DONE', completedBy: 'A' })
  })

  it('micro-passo renomeado durante foco não faz a tarefa inteira ser concluída', () => {
    dataStore.set((state) => ({ ...state, tasks: { tarefa: task([{ id: 'um', text: 'Abrir', done: false }]) } }))
    const focus = startFocus('Abrir', 5, 'tarefa')!
    dataStore.set((state) => ({ ...state, tasks: { tarefa: { ...state.tasks.tarefa!, steps: [{ id: 'um', text: 'Abrir só a primeira gaveta', done: false }] } } }))
    finishFocus(focus)
    expect(dataStore.get().tasks.tarefa).toMatchObject({ status: 'PENDING', steps: [{ done: false }] })
  })

  it('Casal sem passos preserva conclusão da tarefa por quem entrou junto', () => {
    dataStore.set((state) => ({ ...buildEmpty(now), tasks: { tarefa: task() }, outbox: state.outbox }))
    const focus = startFocus('Organizar documentos', 25, 'tarefa')!
    uiStore.set((state) => ({ ...state, viewer: 'B' }))
    joinFocus(focus)
    finishFocus(focus)
    expect(dataStore.get().tasks.tarefa).toMatchObject({ status: 'DONE', completedBy: 'B' })
    expect(toast.mock.calls.at(-1)![0]).toBe('Feito! Tarefa concluída.')
  })

  it('após o prazo, mais dez minutos começam a contar de agora e Fazer pausa não conclui tarefa', () => {
    dataStore.set((state) => ({ ...state, tasks: { tarefa: task() } }))
    const focus = startFocus('Organizar documentos', 5, 'tarefa')!
    vi.setSystemTime(new Date('2026-11-21T14:20:00Z'))
    expect(extendFocus(focus)).toBe(true)
    expect(dataStore.get().focusSessions[focus]).toMatchObject({ endsAt: '2026-11-21T14:30:00.000Z', durationMin: 15 })
    undo()
    expect(dataStore.get().focusSessions[focus]!.endsAt).toBe('2026-11-21T14:05:00.000Z')
    pauseFocus(focus)
    expect(dataStore.get().focusSessions[focus]!.status).toBe('CANCELLED')
    expect(dataStore.get().tasks.tarefa!.status).toBe('PENDING')
    undo()
    expect(dataStore.get().focusSessions[focus]!.status).toBe('RUNNING')
  })

  it('outro perfil não encerra, estende ou pausa um foco individual e não altera passo privado', () => {
    dataStore.set((state) => ({ ...state, tasks: { tarefa: { ...task([{ id: 'um', text: 'Abrir', done: false }]), visibleToPartner: false } } }))
    const focus = startFocus('Abrir', 5, 'tarefa')!
    uiStore.set((state) => ({ ...state, viewer: 'B' }))
    const previous = dataStore.get()
    finishFocus(focus)
    cancelFocus(focus)
    pauseFocus(focus)
    expect(extendFocus(focus)).toBe(false)
    expect(toggleTaskStep('tarefa', 'um')).toBe(false)
    expect(dataStore.get()).toBe(previous)
  })
})
