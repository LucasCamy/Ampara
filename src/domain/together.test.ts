import { describe, expect, it } from 'vitest'
import { activeFocus, applyDeposit, buildFocusSession, canViewFocusSession, FOCUS_DURATIONS, focusView, goalView } from './together'
import { buildSeed } from './seed'
import type { FocusSession, SavingsGoal } from './types'

const session = (p: Partial<FocusSession> = {}): FocusSession => ({
  id: 's',
  startedBy: 'A',
  title: 'Organizar documentos',
  taskId: null,
  durationMin: 25,
  startedAt: '2026-11-06T13:00:00.000Z',
  endsAt: '2026-11-06T13:25:00.000Z',
  joinedBy: null,
  status: 'RUNNING',
  updatedAt: '',
  ...p,
})

describe('body doubling', () => {
  it('foco individual e foco conjunto antigo ligado a tarefa privada só aparecem para o autor', () => {
    const seed = buildSeed(new Date('2026-11-21T10:00:00'))
    const privateTask = Object.values(seed.tasks).find((task) => task.assignedTo === 'A' && !task.visibleToPartner)!
    const oldShared = session({ taskId: privateTask.id })
    expect(canViewFocusSession(oldShared, 'A', seed.tasks)).toBe(true)
    expect(canViewFocusSession(oldShared, 'B', seed.tasks)).toBe(false)
    expect(canViewFocusSession(session({ joinedBy: 'A' }), 'B', seed.tasks)).toBe(false)
    expect(canViewFocusSession(session(), 'B', seed.tasks)).toBe(true)
    expect(canViewFocusSession(oldShared, 'B', { ...seed.tasks, [privateTask.id]: { ...privateTask, visibleToPartner: true } })).toBe(true)
    expect(canViewFocusSession(oldShared, 'B', {})).toBe(false)
  })
  it('inclui um começo de cinco minutos e monta seu prazo sem depender de servidor', () => {
    expect(FOCUS_DURATIONS).toEqual([5, 15, 25, 45])
    const focus = buildFocusSession({ id: 'pequeno', title: ' Abrir a pasta ', minutes: 5, startedBy: 'B', taskId: 'documentos' }, new Date('2026-11-21T14:00:00Z'))
    expect(focus).toMatchObject({ id: 'pequeno', title: 'Abrir a pasta', durationMin: 5, taskId: 'documentos', startedBy: 'B', joinedBy: null, status: 'RUNNING', endsAt: '2026-11-21T14:05:00.000Z' })
    expect(focusView(focus!, new Date('2026-11-21T14:04:01Z'))).toMatchObject({ state: 'running', minutesLeft: 1 })
  })

  it('não monta foco vazio, com duração inválida nem data inválida', () => {
    const input = { id: 'foco', title: 'Um começo', minutes: 5, startedBy: 'A' } as const
    expect(buildFocusSession({ ...input, title: ' ' }, new Date())).toBeNull()
    expect(buildFocusSession({ ...input, minutes: Number.NaN }, new Date())).toBeNull()
    expect(buildFocusSession({ ...input, minutes: 0 }, new Date())).toBeNull()
    expect(buildFocusSession(input, new Date('inválida'))).toBeNull()
  })

  it('minutos que faltam (arredonda para cima), acabou e fechada', () => {
    expect(focusView(session(), new Date('2026-11-06T13:06:30.000Z'))).toMatchObject({ state: 'running', minutesLeft: 19 })
    expect(focusView(session(), new Date('2026-11-06T13:25:00.000Z'))).toEqual({ state: 'finished' })
    expect(focusView(session({ status: 'DONE' }), new Date('2026-11-06T13:10:00.000Z'))).toEqual({ state: 'closed' })
  })

  it('sessão ativa: a mais recente aberta, sem as de ontem', () => {
    const now = new Date('2026-11-06T14:00:00.000Z')
    const old = session({ id: 'old', startedAt: '2026-11-05T10:00:00.000Z' })
    const done = session({ id: 'done', status: 'DONE', startedAt: '2026-11-06T13:50:00.000Z' })
    expect(activeFocus([old, session(), done], now)?.id).toBe('s')
    expect(activeFocus([old], now)).toBeUndefined()
  })
})

describe('caixinhas', () => {
  const goal = (p: Partial<SavingsGoal> = {}): SavingsGoal => ({
    id: 'g',
    title: 'Viagem',
    targetCents: 600_000,
    savedCents: 150_000,
    deadline: null,
    createdBy: 'A',
    createdAt: '',
    updatedAt: '',
    ...p,
  })

  it('progresso e quanto falta', () => {
    expect(goalView(goal(), '2026-11-06')).toMatchObject({ ratio: 0.25, remainingCents: 450_000, done: false, perMonthCents: null })
    expect(goalView(goal({ savedCents: 700_000 }), '2026-11-06')).toMatchObject({ ratio: 1, remainingCents: 0, done: true })
  })

  it('com prazo: quanto por mês até lá', () => {
    const v = goalView(goal({ deadline: '2027-05-06' }), '2026-11-06')
    expect(v.monthsLeft).toBe(6)
    expect(v.perMonthCents).toBe(75_000)
    expect(goalView(goal({ deadline: '2026-10-01' }), '2026-11-06')).toMatchObject({ overdue: true, perMonthCents: 450_000 })
  })

  it('retirada nunca deixa negativo', () => {
    expect(applyDeposit(goal(), 5_000)).toBe(155_000)
    expect(applyDeposit(goal(), -999_999)).toBe(0)
  })
})
