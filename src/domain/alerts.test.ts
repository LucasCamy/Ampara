import { describe, expect, it } from 'vitest'
import {
  clockAlerts,
  decide,
  DEFAULT_PREFS,
  fromServerPrefs,
  inQuietHours,
  incomingAlerts,
  normalizePrefs,
  serverAllows,
  toServerPrefs,
  type AlertPrefs,
} from './alerts'
import { emptyLog, logId, snoozeWater } from './medication'
import { buildEmpty } from './seed'
import type { DataState, HelpRequest, Medication } from './types'

const at = (hhmm: string) => new Date(`2026-11-05T${hhmm}:00`)
const med = (p: Partial<Medication> = {}): Medication => ({
  id: 'venv',
  kind: 'MED',
  ownerId: 'A',
  name: 'Venvanse 30mg',
  dosage: '1 cápsula',
  times: ['08:00'],
  weekdays: [],
  stockCount: null,
  lowStockThreshold: 5,
  notifyPartnerOnDelay: true,
  delayMinutesThreshold: 30,
  updatedAt: '',
  ...p,
})
const withMeds = (...meds: Medication[]): DataState => ({ ...buildEmpty(at('07:00')), meds: Object.fromEntries(meds.map((m) => [m.id, m])) })
const prefs = (p: Partial<AlertPrefs> = {}): AlertPrefs => ({ ...DEFAULT_PREFS, ...p })

describe('preferências', () => {
  it('lê lixo sem quebrar e mantém o que é válido', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS)
    const p = normalizePrefs({ enabled: { partner: false, x: false }, volume: 'ALTO', quiet: { on: true, start: '23:30', end: '25:00' } })
    expect(p.enabled.partner).toBe(false)
    expect(p.enabled.med).toBe(true)
    expect(p.volume).toBe('MEDIUM')
    expect(p.quiet).toEqual({ on: true, start: '23:30', end: '07:00', helpBreaks: true })
  })

  it('horário de silêncio atravessa a meia-noite', () => {
    const q = { on: true, start: '22:00', end: '07:00' }
    expect(inQuietHours(q, 23 * 60)).toBe(true)
    expect(inQuietHours(q, 6 * 60 + 59)).toBe(true)
    expect(inQuietHours(q, 7 * 60)).toBe(false)
    expect(inQuietHours({ ...q, start: '13:00', end: '14:00' }, 13 * 60 + 30)).toBe(true)
    expect(inQuietHours({ ...q, end: '22:00' }, 23 * 60)).toBe(false)
    expect(inQuietHours({ ...q, on: false }, 23 * 60)).toBe(false)
  })

  it('no silêncio o aviso aparece calado; pedido de ajuda fura se a pessoa deixou', () => {
    const p = prefs({ quiet: { on: true, start: '22:00', end: '07:00', helpBreaks: true } })
    expect(decide(p, 'med', 23 * 60)).toEqual({ show: true, loud: false })
    expect(decide(p, 'help', 23 * 60)).toEqual({ show: true, loud: true })
    expect(decide({ ...p, quiet: { ...p.quiet, helpBreaks: false } }, 'help', 23 * 60).loud).toBe(false)
    expect(decide({ ...p, enabled: { ...p.enabled, partner: false } }, 'partner', 12 * 60).show).toBe(false)
  })

  it('o servidor recebe só categorias desligadas e silêncio, e decide igual', () => {
    const p = prefs({ enabled: { ...DEFAULT_PREFS.enabled, home: false }, quiet: { on: true, start: '22:00', end: '07:00', helpBreaks: false } })
    const s = fromServerPrefs(JSON.parse(JSON.stringify(toServerPrefs(p))))
    expect(s).toEqual({ off: ['home'], quiet: { start: '22:00', end: '07:00', helpBreaks: false } })
    expect(serverAllows(s, 'home', 12 * 60)).toBe(false)
    expect(serverAllows(s, 'med', 23 * 60)).toBe(false)
    expect(serverAllows(s, 'help', 23 * 60)).toBe(false)
    expect(serverAllows(s, 'med', 12 * 60)).toBe(true)
    expect(fromServerPrefs({ off: ['med', 'hack'], quiet: { start: 'x' } })).toEqual({ off: ['med'], quiet: null })
  })
})

describe('avisos do relógio', () => {
  it('remédio na hora para a dona, dentro da janela', () => {
    const s = withMeds(med())
    expect(clockAlerts(s, 'A', at('07:59'), 'Julia')).toEqual([])
    const [a] = clockAlerts(s, 'A', at('08:03'), 'Julia')
    expect(a).toMatchObject({ key: `due:${logId('venv', '2026-11-05', '08:00')}`, category: 'med', sound: 'med', actions: ['take', 'water'] })
    expect(clockAlerts(s, 'A', at('08:11'), 'Julia')).toEqual([])
    expect(clockAlerts(s, 'B', at('08:03'), 'Lucas').filter((x) => x.category === 'med')).toEqual([])
  })

  it('rotina da casa é da categoria casa', () => {
    const s = withMeds(med({ id: 'lixo', kind: 'ROUTINE', ownerId: null, name: 'Tirar o lixo', dosage: '' }))
    expect(clockAlerts(s, 'B', at('08:01'), 'Lucas')[0]).toMatchObject({ category: 'home', sound: 'home', title: 'Tirar o lixo' })
  })

  it('fim do "pegando água" tem som próprio e não repete a chegada da hora', () => {
    const m = med()
    const log = snoozeWater(emptyLog(m, '2026-11-05', '08:00', ''), at('08:02'))
    const s = { ...withMeds(m), medLogs: { [log.id]: log } }
    expect(clockAlerts(s, 'A', at('08:04'), 'Julia')).toEqual([])
    const [a] = clockAlerts(s, 'A', at('08:08'), 'Julia')
    expect(a).toMatchObject({ key: `snooze:${log.id}#1`, sound: 'water', title: 'Pegou a água?' })
  })

  it('rede de apoio avisa o par depois do limite', () => {
    const s = withMeds(med())
    expect(clockAlerts(s, 'B', at('08:29'), 'Lucas')).toEqual([])
    expect(clockAlerts(s, 'B', at('08:31'), 'Lucas')[0]).toMatchObject({ category: 'support', title: 'Remédio de Lucas pendente' })
    expect(clockAlerts(s, 'B', at('09:31'), 'Lucas')).toEqual([])
  })

  it('conta do casal que vence hoje, uma vez por dia, a partir das 8h', () => {
    const s = withMeds()
    s.transactions = {
      t1: { id: 't1', scope: 'COUPLE', type: 'EXPENSE', status: 'PREDICTED_DASHED', description: 'Luz', competenceDate: '2026-11-05' } as DataState['transactions'][string],
    }
    expect(clockAlerts(s, 'A', at('07:30'), 'Julia')).toEqual([])
    expect(clockAlerts(s, 'A', at('09:00'), 'Julia')[0]).toMatchObject({ key: 'bills:2026-11-05', category: 'home', title: 'Luz vence hoje' })
  })
})

describe('o que chega do par', () => {
  const help = (p: Partial<HelpRequest> = {}): HelpRequest => ({
    id: 'h1',
    requesterId: 'B',
    targetTaskId: null,
    situation: 'Lavar a louça',
    helpType: 'TAKE_OVER',
    urgency: 'NOW',
    status: 'OPEN',
    response: null,
    respondedAt: null,
    createdAt: at('10:00').toISOString(),
    updatedAt: at('10:00').toISOString(),
    ...p,
  })

  it('pedido de ajuda novo do par vira aviso; o meu não', () => {
    const prev = withMeds()
    const next = { ...prev, helpRequests: { h1: help(), h2: help({ id: 'h2', requesterId: 'A' }) } }
    const out = incomingAlerts(prev, next, 'A', at('10:01'), 'Julia')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ key: 'help:h1', category: 'help', title: 'Julia pediu ajuda', actions: ['help-take', 'help-together'] })
    // o mesmo estado de novo: nada
    expect(incomingAlerts(next, next, 'A', at('10:02'), 'Julia')).toEqual([])
  })

  it('coisa antiga que chega num pull atrasado não avisa', () => {
    const prev = withMeds()
    const next = { ...prev, helpRequests: { h1: help() } }
    expect(incomingAlerts(prev, next, 'A', at('11:00'), 'Julia')).toEqual([])
  })

  it('resposta ao meu pedido, lembrete carinhoso e foco junto', () => {
    const prev = { ...withMeds(), helpRequests: { h1: help({ requesterId: 'A' }) } }
    const next: DataState = {
      ...prev,
      helpRequests: { h1: help({ requesterId: 'A', status: 'ACCEPTED', response: 'TAKE_OVER', respondedAt: at('10:05').toISOString() }) },
      nudges: { n1: { id: 'n1', from: 'B', to: 'A', medicationLogId: 'x', message: 'Toma uma água?', createdAt: at('10:05').toISOString(), seenAt: null, updatedAt: '' } },
      focusSessions: {
        f1: { id: 'f1', startedBy: 'B', title: 'Arrumar a sala', taskId: null, durationMin: 25, startedAt: at('10:05').toISOString(), endsAt: '', joinedBy: null, status: 'RUNNING', updatedAt: '' },
      },
    }
    const keys = incomingAlerts(prev, next, 'A', at('10:06'), 'Julia').map((a) => `${a.key}/${a.category}`)
    expect(keys).toEqual(['help-answer:h1/partner', 'nudge:n1/partner', 'focus:f1/partner'])
  })

  it('tarefa enviada para mim e recado do par', () => {
    const prev = withMeds()
    const ts = at('10:05').toISOString()
    const next: DataState = {
      ...prev,
      tasks: { t1: { id: 't1', assignedTo: 'A', sentBy: 'B', status: 'PENDING', title: 'Pagar o gás', updatedAt: ts } as DataState['tasks'][string] },
      moodCheckins: { 'B@2026-11-05': { id: 'B@2026-11-05', ownerId: 'B', date: '2026-11-05', mood: 'NEED_CARE', note: '', updatedAt: ts } },
    }
    const out = incomingAlerts(prev, next, 'A', at('10:06'), 'Julia')
    expect(out.map((a) => a.label)).toEqual(['Tarefa enviada para você', 'Check-in do seu par'])
    const withNote = { ...next, moodCheckins: { 'B@2026-11-05': { ...next.moodCheckins['B@2026-11-05']!, note: 'Dia puxado', updatedAt: at('10:07').toISOString() } } }
    expect(incomingAlerts(next, withNote, 'A', at('10:08'), 'Julia')[0]).toMatchObject({ label: 'Recado do seu par', body: 'Dia puxado' })
  })
})
