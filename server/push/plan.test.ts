import { describe, expect, it } from 'vitest'
import type { Medication } from '../../src/domain/types'
import { localParts, planNotifications, type PlanInput, type PushSub } from './plan'

const SP = 'America/Sao_Paulo'
// 2026-11-06 08:03 em São Paulo (UTC-3)
const at = (hhmm: string) => new Date(`2026-11-06T${hhmm}:00-03:00`)

const med = (p: Partial<Medication> = {}): Medication & { coupleId: string } => ({
  id: 'venv',
  kind: 'MED',
  ownerId: 'B',
  name: 'Venvanse 30mg',
  dosage: '1 cápsula',
  times: ['08:00'],
  weekdays: [],
  stockCount: null,
  lowStockThreshold: 5,
  notifyPartnerOnDelay: true,
  delayMinutesThreshold: 30,
  updatedAt: '',
  coupleId: 'c1',
  ...p,
})
const ela: PushSub = { endpoint: 'https://push.test/ela', coupleId: 'c1', partnerId: 'B', tz: SP, showDetails: false, prefs: { off: [], quiet: null } }
const ele: PushSub = { endpoint: 'https://push.test/ele', coupleId: 'c1', partnerId: 'A', tz: SP, showDetails: true, prefs: { off: [], quiet: null } }
const base = (p: Partial<PlanInput> = {}): PlanInput => ({ subs: [ela, ele], meds: [med()], logs: [], help: [], names: { c1: { A: 'Lucas Camy', B: 'Julia Aparecida' } }, ...p })

describe('fuso do aparelho', () => {
  it('converte para data e minutos locais', () => {
    expect(localParts(at('08:03'), SP)).toEqual({ date: '2026-11-06', minutes: 483 })
    expect(localParts(new Date('2026-11-07T01:30:00Z'), SP)).toEqual({ date: '2026-11-06', minutes: 22 * 60 + 30 })
    expect(localParts(at('08:03'), 'Fuso/Invalido').date).toBe('2026-11-06')
  })
})

describe('o que mandar agora', () => {
  it('na hora: só para a dona, sem o nome do remédio quando ela não liberou', () => {
    const msgs = planNotifications(base(), at('08:03'))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatchObject({ endpoint: ela.endpoint, title: 'Hora do seu remédio', tag: 'dose-venv@2026-11-06@08:00', url: '/?quick=med' })
    expect(msgs[0]!.body).not.toContain('Venvanse')
  })

  it('com detalhes liberados mostra nome e dose', () => {
    const msgs = planNotifications(base({ subs: [{ ...ela, showDetails: true }] }), at('08:00'))
    expect(msgs[0]).toMatchObject({ title: 'Hora do remédio: Venvanse 30mg', body: '08:00 · 1 cápsula. Já engoliu ou vai pegar água?' })
  })

  it('fora da janela, já tomado ou fora do dia: nada', () => {
    expect(planNotifications(base(), at('07:59'))).toEqual([])
    expect(planNotifications(base(), at('08:11'))).toEqual([])
    expect(planNotifications(base({ logs: [{ id: 'venv@2026-11-06@08:00', coupleId: 'c1', medicationId: 'venv', status: 'TAKEN', snoozeUntil: null, snoozeCount: 0 }] }), at('08:40'))).toEqual([])
    // sexta-feira: remédio só de segunda
    expect(planNotifications(base({ meds: [med({ weekdays: [1] })] }), at('08:03'))).toEqual([])
    // cartela na pausa
    expect(planNotifications(base({ meds: [med({ pack: { activeDays: 21, pauseDays: 7, startDate: '2026-10-14' } })] }), at('08:03'))).toEqual([])
  })

  it('acabou o "pegando água": lembra de novo, uma vez por soneca', () => {
    const log = { id: 'venv@2026-11-06@08:00', coupleId: 'c1', medicationId: 'venv', status: 'SNOOZED_WATER' as const, snoozeUntil: at('08:06').toISOString(), snoozeCount: 1 }
    expect(planNotifications(base({ logs: [log] }), at('08:04'))).toEqual([])
    const msgs = planNotifications(base({ logs: [log] }), at('08:07'))
    expect(msgs.map((m) => [m.title, m.key])).toEqual([['Pegou a água?', 'snooze:venv@2026-11-06@08:00#1|https://push.test/ela']])
  })

  it('rede de apoio: o par recebe depois do limite (com o nome dela, não do remédio, se ele não liberou detalhes)', () => {
    const msgs = planNotifications(base({ subs: [ela, { ...ele, showDetails: false }] }), at('08:31'))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatchObject({ endpoint: ele.endpoint, title: 'Rede de apoio', body: 'Um remédio de Julia ainda consta pendente.' })
    // sem rede de apoio ligada, o par não recebe
    expect(planNotifications(base({ meds: [med({ notifyPartnerOnDelay: false })] }), at('08:31'))).toEqual([])
  })

  it('rotina da casa: o responsável ou os dois', () => {
    const lixo = med({ id: 'lixo', kind: 'ROUTINE', ownerId: null, name: 'Tirar o lixo', times: ['20:00'], notifyPartnerOnDelay: false })
    expect(planNotifications(base({ meds: [lixo] }), at('20:01')).map((m) => m.endpoint).sort()).toEqual([ele.endpoint, ela.endpoint].sort())
    expect(planNotifications(base({ meds: [{ ...lixo, assignee: 'A' }] }), at('20:01')).map((m) => [m.endpoint, m.title])).toEqual([[ele.endpoint, 'Rotina: Tirar o lixo']])
  })

  it('pedido de ajuda vai para o par, nos primeiros 15 min', () => {
    const help = [{ id: 'h1', coupleId: 'c1', requesterId: 'B' as const, situation: 'Marcar dentista', createdAt: at('10:00').toISOString() }]
    const msgs = planNotifications(base({ meds: [], help }), at('10:05'))
    expect(msgs).toEqual([expect.objectContaining({ endpoint: ele.endpoint, title: 'Julia pediu ajuda', body: 'Marcar dentista' })])
    expect(planNotifications(base({ meds: [], help }), at('10:20'))).toEqual([])
  })

  it('outro casal nunca recebe', () => {
    const outro: PushSub = { ...ele, endpoint: 'https://push.test/outro', coupleId: 'c2' }
    expect(planNotifications(base({ subs: [outro] }), at('08:03'))).toEqual([])
  })
})

describe('categorias e preferências do aparelho', () => {
  it('cada lembrete sai com categoria, som e etiqueta; a chave sem o aparelho vai junto', () => {
    const [due] = planNotifications(base(), at('08:03'))
    expect(due).toMatchObject({ category: 'med', sound: 'med', label: 'Remédio · 08:00', ref: 'due:venv@2026-11-06@08:00' })
    const lixo = med({ id: 'lixo', kind: 'ROUTINE', ownerId: null, name: 'Lixo', times: ['20:00'], notifyPartnerOnDelay: false, assignee: 'A' })
    expect(planNotifications(base({ meds: [lixo] }), at('20:01'))[0]).toMatchObject({ category: 'home', label: 'Rotina · 20:00' })
    expect(planNotifications(base(), at('08:31'))[0]).toMatchObject({ category: 'support', label: 'Rede de apoio · 31 min de atraso' })
  })

  it('categoria desligada não sai; no silêncio só o pedido de ajuda fura (se a pessoa deixou)', () => {
    expect(planNotifications(base({ subs: [{ ...ela, prefs: { off: ['med'], quiet: null } }] }), at('08:03'))).toEqual([])
    const quiet = { start: '07:00', end: '09:00', helpBreaks: true }
    expect(planNotifications(base({ subs: [{ ...ela, prefs: { off: [], quiet } }] }), at('08:03'))).toEqual([])
    const help = [{ id: 'h1', coupleId: 'c1', requesterId: 'B' as const, situation: 'Socorro', createdAt: at('08:00').toISOString() }]
    expect(planNotifications(base({ meds: [], help, subs: [{ ...ele, prefs: { off: [], quiet } }] }), at('08:03'))).toHaveLength(1)
    expect(planNotifications(base({ meds: [], help, subs: [{ ...ele, prefs: { off: [], quiet: { ...quiet, helpBreaks: false } } }] }), at('08:03'))).toEqual([])
  })

  it('lembrete carinhoso e foco junto vão para o par, sem detalhes quando ele não liberou', () => {
    const nudges = [{ id: 'n1', coupleId: 'c1', to: 'B' as const, message: 'Toma o Venvanse?', createdAt: at('10:00').toISOString() }]
    const focus = [{ id: 'f1', coupleId: 'c1', startedBy: 'B' as const, title: 'Arrumar a sala', durationMin: 25, startedAt: at('10:00').toISOString() }]
    const msgs = planNotifications(base({ meds: [], nudges, focus }), at('10:02'))
    expect(msgs.map((m) => [m.endpoint, m.category, m.title, m.body])).toEqual([
      [ela.endpoint, 'partner', 'Lucas lembrou de você', 'Abra o Ampara para ver.'],
      [ele.endpoint, 'partner', 'Julia chamou você para focar junto', 'Arrumar a sala'],
    ])
    expect(planNotifications(base({ meds: [], nudges, focus }), at('10:30'))).toEqual([])
    expect(planNotifications(base({ meds: [], nudges, subs: [{ ...ela, prefs: { off: ['partner'], quiet: null } }] }), at('10:02'))).toEqual([])
  })
})
