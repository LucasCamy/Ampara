import { describe, expect, it } from 'vitest'
import { activeFocus, applyDeposit, focusView, goalView } from './together'
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
