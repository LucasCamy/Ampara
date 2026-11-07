import { describe, expect, it } from 'vitest'
import { agendaMarks, marksForScope, type AgendaMarkInput } from './agenda'
import { defaultCycleSettings } from './cycle'
import type { CycleLog, CycleSettings } from './types'

const log = (startDate: string, ownerId: 'A' | 'B', endDate: string | null = null): CycleLog => ({ id: `${ownerId}${startDate}`, ownerId, startDate, endDate, updatedAt: '' })
const settings = (owner: 'A' | 'B', p: Partial<CycleSettings> = {}): CycleSettings => ({ ...defaultCycleSettings(owner, ''), ...p })

const base = (p: Partial<AgendaMarkInput> = {}): AgendaMarkInput => ({
  viewer: 'A',
  partnerId: 'B',
  names: { A: 'Lucas Camy', B: 'Julia Aparecida' },
  specialDates: [],
  cycleLogs: [],
  cycleSettings: {},
  today: '2026-11-06',
  ...p,
})

describe('agenda única', () => {
  it('data especial no dia certo, contando os anos', () => {
    const marks = agendaMarks(
      base({ specialDates: [{ id: 's', title: 'Aniversário de namoro', date: '2023-11-10', kind: 'ANNIVERSARY', personId: null, createdBy: 'A', updatedAt: '' }] }),
      '2026-11-01',
      '2026-11-30',
    )
    expect(marks).toEqual([{ date: '2026-11-10', kind: 'SPECIAL', owner: 'us', label: '3 anos de namoro' }])
  })

  it('ciclo da parceira com "Só o aviso": só a semana de mais cuidado, nunca a menstruação', () => {
    const logs = [log('2026-10-15', 'B', '2026-10-19')]
    const s = settings('B', { share: 'GENTLE', sensitiveFrom: '2026-11-05', sensitiveTo: '2026-11-11' })
    const marks = agendaMarks(base({ cycleLogs: logs, cycleSettings: { B: s } }), '2026-11-01', '2026-11-30')
    expect(marks.every((m) => m.kind === 'CARE' && m.owner === 'partner')).toBe(true)
    expect(marks.map((m) => m.date)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'])
    expect(marks[0]!.label).toBe('Semana de mais cuidado de Julia')
  })

  it('"Só eu vejo": nada do ciclo dela aparece para ele', () => {
    const marks = agendaMarks(base({ cycleLogs: [log('2026-10-15', 'B')], cycleSettings: { B: settings('B', { share: 'NONE' }) } }), '2026-11-01', '2026-11-30')
    expect(marks).toEqual([])
  })

  it('"Tudo": também a menstruação prevista dela', () => {
    const marks = agendaMarks(base({ cycleLogs: [log('2026-10-15', 'B')], cycleSettings: { B: settings('B', { share: 'FULL' }) } }), '2026-11-01', '2026-11-30')
    expect(marks.some((m) => m.kind === 'PERIOD' && m.date === '2026-11-12' && m.label === 'Menstruação prevista de Julia')).toBe(true)
  })

  it('o próprio ciclo: menstruação atual e prevista, e filtro por pessoa', () => {
    const marks = agendaMarks(
      base({ viewer: 'B', partnerId: 'A', cycleLogs: [log('2026-11-05', 'B')], cycleSettings: { B: settings('B') } }),
      '2026-11-01',
      '2026-12-10',
    )
    expect(marks.filter((m) => m.kind === 'PERIOD' && m.label === 'Menstruação').map((m) => m.date)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'])
    expect(marks.some((m) => m.kind === 'PERIOD' && m.date === '2026-12-03' && m.label === 'Menstruação prevista')).toBe(true)
    expect(marksForScope(marks, 'PARTNER')).toEqual([])
    expect(marksForScope(marks, 'MINE')).toHaveLength(marks.length)
  })
})
