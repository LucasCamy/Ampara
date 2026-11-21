import { describe, expect, it } from 'vitest'
import { buildEmpty } from './seed'
import { emptyLog, logId } from './medication'
import { buildDaySpeechSummary } from './today'
import type { CalendarEvent, Medication, Task, Transaction } from './types'

const now = new Date('2026-11-21T10:00:00')
const today = '2026-11-21'
const task = (other: Partial<Task> = {}): Task => ({ id: 'task', title: 'Separar documentos', assignedTo: 'A', createdBy: 'A', effort: 'QUICK_5M', status: 'PENDING', dueDate: today, dueTime: null, visibleToPartner: false, sentBy: null, completedAt: null, completedBy: null, sourceMedicationId: null, createdAt: '', updatedAt: '', ...other })
const med = (other: Partial<Medication> = {}): Medication => ({ id: 'med', name: 'Remédio pessoal', kind: 'MED', ownerId: 'A', dosage: '1 comprimido', times: ['09:00'], weekdays: [], stockCount: null, lowStockThreshold: 0, notifyPartnerOnDelay: false, delayMinutesThreshold: 30, updatedAt: '', ...other })
const event = (other: Partial<CalendarEvent> = {}): CalendarEvent => ({ id: 'event', title: 'Consulta de rotina', date: today, start: '10:30', end: '11:30', ownerId: 'A', kind: 'PERSONAL', updatedAt: '', ...other })
const bill = (other: Partial<Transaction> = {}): Transaction => ({ id: 'bill', description: 'Internet', createdBy: 'A', paidBy: 'A', scope: 'PERSONAL', type: 'EXPENSE', status: 'PREDICTED_DASHED', isSecretGift: false, amountCents: 3500, category: 'HOME', splitRule: null, partnerAShareCents: 3500, partnerBShareCents: 0, competenceDate: today, updatedAt: '', ...other })

describe('resumo do dia para voz', () => {
  it('mantém o resumo vazio curto e calmo, sem inventar uma próxima ação', () => {
    const summary = buildDaySpeechSummary(buildEmpty(now, 'SOLO'), 'A', now)
    expect(summary).toContain('0 tarefas, 0 doses de remédio e 0 compromissos')
    expect(summary).toContain('sem pendências agendadas por enquanto')
    expect(summary).toContain('Um pequeno passo já conta')
    expect(summary.split(/\s+/).length).toBeGreaterThanOrEqual(40)
    expect(summary.split(/\s+/).length).toBeLessThanOrEqual(50)
  })

  it('prioriza dose a confirmar sobre compromisso e tarefa e inclui conta pessoal vencida', () => {
    const state = buildEmpty(now, 'SOLO')
    state.tasks.task = task()
    state.meds.med = med()
    state.events.event = event()
    state.transactions.bill = bill({ competenceDate: '2026-11-19' })
    const before = JSON.stringify(state)
    const summary = buildDaySpeechSummary(state, 'A', now)
    expect(summary).toContain('1 tarefa, 1 dose de remédio e 1 compromisso')
    expect(summary).toContain('confirmar seu remédio das 09:00')
    expect(summary).toContain('1 conta para conferir hoje')
    expect(summary.split(/\s+/).length).toBeLessThanOrEqual(50)
    expect(JSON.stringify(state)).toBe(before)
    expect(buildDaySpeechSummary(state, 'A', now)).toBe(summary)
  })

  it('leva em conta doses tomadas ou puladas e compromissos que já terminaram', () => {
    const state = buildEmpty(now, 'SOLO')
    state.meds.med = med({ times: ['08:00', '09:00'] })
    state.medLogs[logId('med', today, '08:00')] = { ...emptyLog(state.meds.med, today, '08:00', ''), status: 'TAKEN' }
    state.medLogs[logId('med', today, '09:00')] = { ...emptyLog(state.meds.med, today, '09:00', ''), status: 'SKIPPED' }
    state.tasks.done = task({ id: 'done', status: 'DONE' })
    state.events.past = event({ id: 'past', start: '08:00', end: '09:00' })
    const summary = buildDaySpeechSummary(state, 'A', now)
    expect(summary).toContain('0 tarefas, 0 doses de remédio e 0 compromissos')
  })

  it('só usa tarefas próprias ou compartilhadas e nunca fala detalhes privados do par', () => {
    const state = buildEmpty(now)
    state.tasks.partner = task({ id: 'partner', title: 'Segredo tarefa do par', createdBy: 'B', assignedTo: 'B' })
    state.tasks.shared = task({ id: 'shared', title: 'Preparar mochila juntos', assignedTo: null })
    state.meds.partner = med({ id: 'partner', name: 'Segredo remédio do par', ownerId: 'B', notifyPartnerOnDelay: true })
    state.events.partner = event({ id: 'partner', title: 'Segredo evento do par', ownerId: 'B' })
    state.transactions.secret = bill({ id: 'secret', description: 'Segredo presente do par', createdBy: 'B', paidBy: 'B', isSecretGift: true })
    const summary = buildDaySpeechSummary(state, 'A', now)
    expect(summary).not.toContain('Segredo')
    expect(summary).toContain('1 tarefa, 0 doses de remédio e 0 compromissos')
    expect(summary).toContain('Preparar mochila juntos')
    expect(summary).toContain('Nenhuma conta pendente')
  })

  it('não conta finanças pessoais do par mesmo compartilhadas e ignora contas futuras ou já pagas', () => {
    const state = buildEmpty(now)
    state.profiles.B!.sharePersonalFinances = true
    state.transactions.partner = bill({ id: 'partner', createdBy: 'B', paidBy: 'B' })
    state.transactions.future = bill({ id: 'future', competenceDate: '2026-11-22' })
    state.transactions.paid = bill({ id: 'paid', status: 'CONFIRMED_SOLID' })
    state.transactions.shared = bill({ id: 'shared', scope: 'COUPLE', createdBy: 'B' })
    expect(buildDaySpeechSummary(state, 'A', now)).toContain('1 conta para conferir hoje')
  })

  it('apresenta compromisso próximo antes da tarefa e preserva o horário da pessoa', () => {
    const state = buildEmpty(now, 'SOLO')
    state.tasks.task = task()
    state.events.event = event()
    const summary = buildDaySpeechSummary(state, 'A', now)
    expect(summary).toContain('Consulta de rotina, às 10:30')
    expect(summary).not.toContain('Comece por Separar')
  })

  it('dá prioridade à tarefa de hoje e usa amanhã só para não incluir tarefas futuras', () => {
    const state = buildEmpty(now, 'SOLO')
    state.tasks.today = task({ title: 'Abrir a pasta' })
    state.tasks.future = task({ id: 'future', title: 'Tarefa de amanhã', dueDate: '2026-11-22' })
    state.tasks.inbox = task({ id: 'inbox', title: 'Tarefa da entrada', dueDate: null })
    const summary = buildDaySpeechSummary(state, 'A', now)
    expect(summary).toContain('1 tarefa')
    expect(summary).toContain('Comece por Abrir a pasta')
    expect(summary).not.toContain('Tarefa de amanhã')
  })
})
