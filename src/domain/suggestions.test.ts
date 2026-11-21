import { describe, expect, it } from 'vitest'
import { buildEmpty } from './seed'
import { pickTopSuggestion, SUGGESTION_COOLDOWN_MS } from './suggestions'
import type { CalendarEvent, DataState, Medication, MoodCheckin, RecurringRule, Task, Transaction } from './types'

const now = new Date('2026-11-21T10:00:00')
const base = () => {
  const state = buildEmpty(now)
  state.couple.couple!.pairedAt = new Date('2026-01-01T12:00:00').toISOString()
  return state
}
const task = (id: string, other: Partial<Task> = {}): Task => ({ id, title: 'Organizar documentos', createdBy: 'A', assignedTo: 'A', effort: 'FOCUS', status: 'PENDING', dueDate: '2026-11-21', dueTime: null, visibleToPartner: false, sentBy: null, completedAt: null, completedBy: null, sourceMedicationId: null, createdAt: '', updatedAt: '', postponeCount: 3, ...other })
const tx = (id: string, date: string, other: Partial<Transaction> = {}): Transaction => ({ id, description: 'Academia', amountCents: 9900, createdBy: 'A', paidBy: 'A', scope: 'PERSONAL', isSecretGift: false, type: 'EXPENSE', status: 'CONFIRMED_SOLID', category: 'HEALTH', splitRule: null, partnerAShareCents: 9900, partnerBShareCents: 0, competenceDate: date, updatedAt: '', ...other })
const event = (id: string, other: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, title: 'Consulta médica', date: '2026-11-22', start: '10:00', end: '11:00', kind: 'HEALTH', ownerId: 'A', updatedAt: '', ...other })
const rule = (other: Partial<RecurringRule> = {}): RecurringRule => ({ id: 'rule', createdBy: 'A', scope: 'PERSONAL', description: 'Academia', category: 'HEALTH', amountCents: 9900, paidBy: 'A', splitRule: null, dayOfMonth: 21, startMonth: '2026-12', endMonth: null, skipMonths: [], updatedAt: '', ...other })
const checkin = (date: string, other: Partial<MoodCheckin> = {}): MoodCheckin => ({ id: `A@${date}`, ownerId: 'A', date, mood: 'LOW_ENERGY', note: '', updatedAt: '', ...other })
const addRepeated = (state: DataState, other: Partial<Transaction> = {}) => {
  state.transactions.oct = tx('oct', '2026-10-20', other)
  state.transactions.nov = tx('nov', '2026-11-20', other)
}

describe('uma sugestão por vez, ordem e cooldown', () => {
  it('segue a ordem tarefa, conta fixa, preparo, kit e não retorna uma lista', () => {
    const state = base()
    state.tasks.t = task('t')
    addRepeated(state)
    state.events.e = event('e')
    state.moodCheckins.one = checkin('2026-11-20')
    state.moodCheckins.two = checkin('2026-11-21', { mood: 'OVERWHELMED' })
    const dismissals: Record<string, number> = {}
    for (const expected of ['postponed-task', 'recurring-expense', 'event-preparation', 'comfort-kit']) {
      const suggestion = pickTopSuggestion(state, 'A', now, { dismissals })!
      expect(suggestion.kind).toBe(expected)
      expect(Array.isArray(suggestion)).toBe(false)
      dismissals[suggestion.id] = now.getTime()
    }
    expect(pickTopSuggestion(state, 'A', now, { dismissals })).toBeNull()
  })

  it('nunca mostra sugestão na sobrecarga, mesmo com candidatos de todas as prioridades', () => {
    const state = buildEmpty(now)
    state.profiles.A!.energy = 'OVERLOAD'
    state.tasks.t = task('t')
    addRepeated(state)
    state.events.e = event('e')
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
  })

  it('cooldown dura sete dias exatos e timestamp futuro não provoca reapresentação', () => {
    const state = base()
    state.tasks.t = task('t')
    const id = pickTopSuggestion(state, 'A', now)!.id
    expect(pickTopSuggestion(state, 'A', now, { dismissals: { [id]: now.getTime() - SUGGESTION_COOLDOWN_MS + 1 } })).toBeNull()
    expect(pickTopSuggestion(state, 'A', now, { dismissals: { [id]: now.getTime() - SUGGESTION_COOLDOWN_MS } })?.id).toBe(id)
    expect(pickTopSuggestion(state, 'A', now, { dismissals: { [id]: now.getTime() + 60_000 } })).toBeNull()
  })

  it('é pura e escolhe o mesmo resultado independentemente da ordem dos registros', () => {
    const state = base()
    state.tasks.z = task('z')
    state.tasks.a = task('a')
    const before = JSON.stringify(state)
    const timestamp = now.getTime()
    const result = pickTopSuggestion(state, 'A', now)
    const reordered = { ...state, tasks: { a: state.tasks.a, z: state.tasks.z } }
    expect(pickTopSuggestion(reordered, 'A', now)).toEqual(result)
    expect(JSON.stringify(state)).toBe(before)
    expect(now.getTime()).toBe(timestamp)
  })

  it('não procura dados sem perfil da pessoa', () => {
    const state = base()
    state.profiles = {}
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
  })
})

describe('tarefa adiada', () => {
  it('sugere tarefa própria ou compartilhada a partir de três adiamentos', () => {
    const state = base()
    state.tasks.two = task('two', { postponeCount: 2 })
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
    state.tasks.shared = task('shared', { assignedTo: null, createdBy: 'B' })
    expect(pickTopSuggestion(state, 'A', now)).toMatchObject({ id: 'postponed-task:shared', payload: { taskId: 'shared' } })
  })

  it('não sugere arquivar tarefa do par, concluída ou arquivada', () => {
    const state = base()
    state.tasks.partner = task('partner', { assignedTo: 'B', visibleToPartner: true })
    state.tasks.done = task('done', { status: 'DONE' })
    state.tasks.archived = task('archived', { status: 'ARCHIVED' })
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
  })
})

describe('gasto repetido que pode virar conta fixa', () => {
  it('exige meses diferentes, normaliza descrição e usa o valor mais recente sem alterar históricos', () => {
    const state = base()
    state.transactions.oct = tx('oct', '2026-10-20', { description: 'ASSINATURA - Música', amountCents: 1500 })
    state.transactions.nov = tx('nov', '2026-11-20', { description: 'Assinatura música', amountCents: 1790 })
    const suggestion = pickTopSuggestion(state, 'A', now)!
    expect(suggestion).toMatchObject({ kind: 'recurring-expense', payload: { transactionId: 'nov', amountCents: 1790, description: 'Assinatura música' } })
    expect(suggestion.id).not.toContain('música')
    expect(suggestion.id).not.toContain('assinatura')
    state.transactions.newer = tx('newer', '2026-11-21', { description: 'assinatura MÚSICA', amountCents: 1790 })
    expect(pickTopSuggestion(state, 'A', now)!.id).toBe(suggestion.id)
  })

  it('não transforma duas compras no mesmo mês em conta fixa', () => {
    const state = base()
    state.transactions.one = tx('one', '2026-11-10')
    state.transactions.two = tx('two', '2026-11-20')
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
  })

  it.each([
    { recurrenceId: 'existing' }, { installmentGroup: 'parcelas' }, { installmentTotal: 3 }, { isSecretGift: true }, { status: 'PREDICTED_DASHED' as const }, { type: 'INCOME' as const },
  ])('ignora regras, parcelas, presentes, previsões e receitas: %s', (other) => {
    const state = base()
    addRepeated(state, other)
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
  })

  it('não usa lançamentos pessoais do par mesmo com transparência ativa', () => {
    const state = base()
    state.profiles.B!.sharePersonalFinances = true
    addRepeated(state, { createdBy: 'B', paidBy: 'B' })
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
  })

  it('permite gasto compartilhado no Casal e o omite do painel Solo', () => {
    const state = base()
    addRepeated(state, { scope: 'COUPLE', createdBy: 'B', paidBy: 'B' })
    expect(pickTopSuggestion(state, 'A', now)?.kind).toBe('recurring-expense')
    state.couple.couple!.mode = 'SOLO'
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
  })

  it('uma regra equivalente ativa ou que começa no próximo mês impede duplicação', () => {
    const state = base()
    addRepeated(state)
    state.recurrences.r = rule({ description: 'ACADÊMIA!' })
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
    state.recurrences.r.endMonth = '2026-10'
    expect(pickTopSuggestion(state, 'A', now)?.kind).toBe('recurring-expense')
  })

  it('uma regra pessoal do par não interfere no padrão financeiro próprio', () => {
    const state = base()
    addRepeated(state)
    state.recurrences.r = rule({ createdBy: 'B', paidBy: 'B' })
    expect(pickTopSuggestion(state, 'A', now)?.kind).toBe('recurring-expense')
  })
})

describe('preparo de compromissos', () => {
  it.each(['Médico', 'Consulta médica', 'Exame', 'Dentista', 'Viagem', 'Voo', 'Entrevista', 'Cartório'])('reconhece %s e prepara um dia antes', (title) => {
    const state = base()
    state.events.e = event('e', { title })
    expect(pickTopSuggestion(state, 'A', now)).toMatchObject({ kind: 'event-preparation', payload: { eventId: 'e', prepTitle: `Preparar para ${title}`, dueDate: '2026-11-21' } })
  })

  it('inclui o terceiro dia e hoje no futuro, mas exclui o quarto dia e evento já iniciado', () => {
    const state = base()
    state.events.e = event('e', { date: '2026-11-24' })
    expect(pickTopSuggestion(state, 'A', now)?.kind).toBe('event-preparation')
    state.events.e.date = '2026-11-25'
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
    state.events.e = event('e', { date: '2026-11-21', start: '11:00' })
    expect(pickTopSuggestion(state, 'A', now)).toMatchObject({ payload: { dueDate: '2026-11-21' } })
    state.events.e.start = '09:00'
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
  })

  it('nunca revela evento privado do par', () => {
    const state = base()
    state.events.e = event('e', { ownerId: 'B' })
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
  })

  it('uma tarefa de preparo própria pendente ou concluída impede a repetição', () => {
    const state = base()
    state.events.e = event('e')
    state.tasks.prep = task('prep', { title: 'Preparar para Consulta médica', postponeCount: 0, dueDate: '2026-11-21' })
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
    state.tasks.prep.status = 'DONE'
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
    state.tasks.prep.dueDate = '2026-10-21'
    expect(pickTopSuggestion(state, 'A', now)?.kind).toBe('event-preparation')
  })

  it('reconhece preparo manual relevante na Entrada sem depender do texto gerado', () => {
    const state = base()
    state.events.e = event('e', { title: 'Viagem Recife' })
    state.tasks.prep = task('prep', { title: 'Arrumar mala para Recife', dueDate: null, postponeCount: 0 })
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
  })
})

describe('kit de conforto e descoberta progressiva', () => {
  it('precisa de dois dias recentes de baixa energia próprios e nenhum item no kit próprio', () => {
    const state = base()
    state.moodCheckins.one = checkin('2026-11-20')
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
    state.moodCheckins.two = checkin('2026-11-21', { mood: 'OVERWHELMED' })
    state.comfortItems.partner = { id: 'partner', ownerId: 'B', text: 'Chá do par', createdAt: '', updatedAt: '' }
    expect(pickTopSuggestion(state, 'A', now)?.kind).toBe('comfort-kit')
    state.comfortItems.mine = { id: 'mine', ownerId: 'A', text: 'Um pouco de silêncio', createdAt: '', updatedAt: '' }
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
  })

  it('ignora check-ins antigos, futuros, repetidos no mesmo dia e os do par', () => {
    const state = base()
    state.moodCheckins.today = checkin('2026-11-21')
    state.moodCheckins.duplicate = checkin('2026-11-21', { id: 'duplicate', mood: 'OVERWHELMED' })
    state.moodCheckins.old = checkin('2026-11-14')
    state.moodCheckins.future = checkin('2026-11-22')
    state.moodCheckins.partner = checkin('2026-11-20', { ownerId: 'B' })
    expect(pickTopSuggestion(state, 'A', now)).toBeNull()
  })

  it('mostra uma dica por vez nos primeiros dias e progride ao dispensar cada uma', () => {
    const state = buildEmpty(now)
    const dismissals: Record<string, number> = {}
    for (const tip of ['reading', 'voice', 'routines']) {
      const suggestion = pickTopSuggestion(state, 'A', now, { dismissals })!
      expect(suggestion).toEqual({ id: `discovery:${tip}`, kind: 'discovery', payload: { tip } })
      dismissals[suggestion.id] = now.getTime()
    }
    expect(pickTopSuggestion(state, 'A', now, { dismissals })).toBeNull()
  })

  it('omite dicas de recursos já usados e encerra a descoberta no sétimo dia', () => {
    const state = buildEmpty(now)
    expect(pickTopSuggestion(state, 'A', now, { readingFont: 'lexend', voiceUsed: true })).toMatchObject({ payload: { tip: 'routines' } })
    state.meds.routine = { id: 'routine', kind: 'ROUTINE' } as Medication
    expect(pickTopSuggestion(state, 'A', now, { readingFont: 'atkinson', voiceUsed: true })).toBeNull()
    expect(pickTopSuggestion(buildEmpty(now), 'A', new Date('2026-11-28T10:00:00'))).toBeNull()
    expect(pickTopSuggestion(buildEmpty(now), 'A', now, { discoveryDisabled: true })).toBeNull()
  })
})
