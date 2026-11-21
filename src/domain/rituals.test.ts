import { describe, expect, it } from 'vitest'
import { emptyLog } from './medication'
import { defaultRitualSchedules, normalizeRitualSchedules, pickRitualWindow, ritualAlertKey, ritualDayProgress, ritualDoneKey, ritualLocalScope } from './rituals'
import { buildEmpty, buildSeed } from './seed'

describe('janelas dos rituais locais', () => {
  it('tem manhã e fechamento ativos e tarde opcional sem compartilhar objetos mutáveis', () => {
    const first = defaultRitualSchedules()
    expect(first).toEqual({ morning: { enabled: true, time: '08:30' }, afternoon: { enabled: false, time: '14:30' }, evening: { enabled: true, time: '21:00' } })
    first.morning.enabled = false
    expect(defaultRitualSchedules().morning.enabled).toBe(true)
  })

  it('normaliza horários inválidos e mantém preferências explícitas', () => {
    expect(normalizeRitualSchedules({ morning: { enabled: false, time: '25:00' }, afternoon: { enabled: true, time: '15:45' }, evening: null })).toEqual({ morning: { enabled: false, time: '08:30' }, afternoon: { enabled: true, time: '15:45' }, evening: { enabled: true, time: '21:00' } })
    expect(normalizeRitualSchedules(null)).toEqual(defaultRitualSchedules())
  })

  it('não aparece antes do começo e abre na borda exata do horário local', () => {
    const schedules = defaultRitualSchedules()
    expect(pickRitualWindow(schedules, new Date('2026-11-21T08:29:59'), new Set())).toBeNull()
    expect(pickRitualWindow(schedules, new Date('2026-11-21T08:30:00'), new Set())).toBe('morning')
  })

  it('usa a janela mais recente e não volta à manhã após concluir a noite', () => {
    const schedules = defaultRitualSchedules()
    expect(pickRitualWindow(schedules, new Date('2026-11-21T21:00:00'), new Set())).toBe('evening')
    expect(pickRitualWindow(schedules, new Date('2026-11-21T22:00:00'), new Set(['evening']))).toBeNull()
  })

  it('respeita a tarde ligada, horários customizados e não repete uma janela concluída', () => {
    const schedules = normalizeRitualSchedules({ afternoon: { enabled: true, time: '16:00' } })
    expect(pickRitualWindow(schedules, new Date('2026-11-21T15:59:00'), new Set(['morning']))).toBeNull()
    expect(pickRitualWindow(schedules, new Date('2026-11-21T16:00:00'), new Set(['morning']))).toBe('afternoon')
    expect(pickRitualWindow(schedules, new Date('2026-11-21T18:00:00'), new Set(['afternoon']))).toBeNull()
  })

  it('não exibe nenhum ritual quando todas as janelas estão desligadas', () => {
    const schedules = normalizeRitualSchedules({ morning: { enabled: false }, evening: { enabled: false } })
    expect(pickRitualWindow(schedules, new Date('2026-11-21T22:00:00'), new Set())).toBeNull()
  })

  it('separa marcadores por espaço, pessoa, dia e janela sem conteúdo pessoal', () => {
    const key = ritualDoneKey('space-one', 'A', '2026-11-21', 'morning')
    expect(key).not.toBe(ritualDoneKey('space-two', 'A', '2026-11-21', 'morning'))
    expect(key).not.toBe(ritualDoneKey('space-one', 'B', '2026-11-21', 'morning'))
    expect(key).not.toBe(ritualDoneKey('space-one', 'A', '2026-11-22', 'morning'))
    expect(key).not.toBe(ritualDoneKey('space-one', 'A', '2026-11-21', 'evening'))
    expect(ritualAlertKey(null, 'A', '2026-11-21', 'morning')).toBe('ritual:local:A:2026-11-21:morning')
  })

  it('conectar a nuvem não muda o escopo dos marcadores locais', () => {
    const state = buildEmpty(new Date('2026-11-21T10:00:00'), 'SOLO')
    const before = ritualLocalScope(state)
    state.couple.couple!.spaceId = 'cloud-space'
    expect(ritualLocalScope(state)).toBe(before)
  })
})

describe('fechamento leve do dia', () => {
  it('celebra apenas conclusões de hoje da pessoa e doses dos próprios remédios', () => {
    const now = new Date('2026-11-21T21:00:00')
    const state = buildEmpty(now, 'SOLO')
    const sample = Object.values(buildSeed(now).tasks)[0]!
    state.tasks.mine = { ...sample, id: 'mine', status: 'DONE', completedBy: 'A', completedAt: new Date('2026-11-21T10:00:00').toISOString() }
    state.tasks.yesterday = { ...sample, id: 'yesterday', status: 'DONE', completedBy: 'A', completedAt: new Date('2026-11-20T10:00:00').toISOString() }
    state.tasks.partner = { ...sample, id: 'partner', status: 'DONE', completedBy: 'B', completedAt: new Date('2026-11-21T11:00:00').toISOString() }
    const ownMed = Object.values(buildSeed(now).meds).find((med) => med.ownerId === 'A')!
    state.meds[ownMed.id] = ownMed
    const log = { ...emptyLog(ownMed, '2026-11-20', '23:00', ''), status: 'TAKEN' as const, takenAt: new Date('2026-11-21T00:05:00').toISOString(), confirmedBy: 'A' as const }
    state.medLogs[log.id] = log
    state.meds.partner = { ...ownMed, id: 'partner', ownerId: 'B' }
    state.medLogs.partner = { ...log, id: 'partner', medicationId: 'partner' }
    expect(ritualDayProgress(state, 'A', '2026-11-21')).toMatchObject({ tasksDone: 1, dosesTaken: 1 })
  })

  it('conta pendentes de hoje e atrasadas próprias ou compartilhadas, nunca entrada ou tarefas do par', () => {
    const now = new Date('2026-11-21T21:00:00')
    const state = buildEmpty(now)
    const sample = Object.values(buildSeed(now).tasks)[0]!
    state.tasks.today = { ...sample, id: 'today', assignedTo: 'A', dueDate: '2026-11-21' }
    state.tasks.late = { ...sample, id: 'late', assignedTo: null, dueDate: '2026-11-20' }
    state.tasks.partner = { ...sample, id: 'partner', assignedTo: 'B', dueDate: '2026-11-21' }
    state.tasks.inbox = { ...sample, id: 'inbox', assignedTo: 'A', dueDate: null }
    state.tasks.future = { ...sample, id: 'future', assignedTo: 'A', dueDate: '2026-11-22' }
    expect(ritualDayProgress(state, 'A', '2026-11-21').pendingTasks).toBe(2)
  })
})
