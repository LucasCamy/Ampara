import { atTime, minutesOf, toDateKey, toTimeKey } from './dates'
import { doseView, emptyLog, isScheduledOn, logId, shouldAlertPartner, type DoseView } from './medication'
import { visibleTransactions } from './privacy'
import { canViewTask, tasksForDay } from './tasks'
import type { CalendarEvent, DataState, DateKey, Medication, MedicationLog, PartnerId, Task } from './types'

export interface DoseItem {
  med: Medication
  log: MedicationLog
  view: DoseView
}

/** Remédios do visualizador + rotinas da casa visíveis num dia */
export function dosesFor(state: DataState, viewer: PartnerId, date: DateKey, now: Date, includeRoutines = true): DoseItem[] {
  const out: DoseItem[] = []
  for (const med of Object.values(state.meds)) {
    const mine = med.ownerId === viewer
    const routine = med.ownerId === null
    if (!mine && !(routine && includeRoutines)) continue
    if (!isScheduledOn(med, date)) continue
    for (const time of med.times) {
      const log = state.medLogs[logId(med.id, date, time)] ?? emptyLog(med, date, time, now.toISOString())
      out.push({ med, log, view: doseView(log, now) })
    }
  }
  return out.sort((a, b) => minutesOf(a.log.scheduledTime) - minutesOf(b.log.scheduledTime))
}

/** Doses do par que estão na rede de apoio e atrasaram além do limite */
export function partnerDelayAlerts(state: DataState, viewer: PartnerId, now: Date): DoseItem[] {
  const today = toDateKey(now)
  const out: DoseItem[] = []
  for (const med of Object.values(state.meds)) {
    if (med.ownerId === null || med.ownerId === viewer || !isScheduledOn(med, today)) continue
    for (const time of med.times) {
      const log = state.medLogs[logId(med.id, today, time)] ?? emptyLog(med, today, time, now.toISOString())
      if (shouldAlertPartner(med, log, now)) out.push({ med, log, view: doseView(log, now) })
    }
  }
  return out
}

/** Remédios do par visíveis por estarem na rede de apoio */
export function partnerSupportedDoses(state: DataState, viewer: PartnerId, date: DateKey, now: Date): DoseItem[] {
  const out: DoseItem[] = []
  for (const med of Object.values(state.meds)) {
    if (med.ownerId === null || med.ownerId === viewer || !med.notifyPartnerOnDelay || !isScheduledOn(med, date)) continue
    for (const time of med.times) {
      const log = state.medLogs[logId(med.id, date, time)] ?? emptyLog(med, date, time, now.toISOString())
      out.push({ med, log, view: doseView(log, now) })
    }
  }
  return out
}

export type NextAction =
  | { kind: 'dose'; dose: DoseItem }
  | { kind: 'event'; event: CalendarEvent; minutesUntil: number }
  | { kind: 'task'; task: Task }
  | { kind: 'none' }

const URGENT: DoseView[] = ['SNOOZED_WATER', 'LATE', 'DUE']

/**
 * A próxima ação vem antes de tudo:
 * 1. dose em snooze / atrasada / no horário
 * 2. compromisso começando em até 90 min
 * 3. primeira tarefa pendente de hoje (rápidas primeiro)
 */
export function nextAction(doses: DoseItem[], events: CalendarEvent[], tasks: Task[], now: Date): NextAction {
  const ranked = [...doses]
    .filter((d) => URGENT.includes(d.view))
    .sort((a, b) => URGENT.indexOf(a.view) - URGENT.indexOf(b.view) || minutesOf(a.log.scheduledTime) - minutesOf(b.log.scheduledTime))
  const urgentDose = ranked.find((d) => d.med.kind === 'MED') ?? ranked[0]
  if (urgentDose) return { kind: 'dose', dose: urgentDose }

  const today = toDateKey(now)
  const nowMin = minutesOf(toTimeKey(now))
  const soon = events
    .filter((e) => e.date === today)
    .map((e) => ({ e, until: minutesOf(e.start) - nowMin }))
    .filter((x) => x.until >= -15 && x.until <= 90)
    .sort((a, b) => a.until - b.until)[0]
  if (soon) return { kind: 'event', event: soon.e, minutesUntil: soon.until }

  const task = tasks.find((t) => t.status === 'PENDING' && t.dueDate === today)
  if (task) return { kind: 'task', task }
  return { kind: 'none' }
}

/** Itens das próximas horas para a linha do tempo do dia */
export function upcomingEvents(events: CalendarEvent[], now: Date, hours = 4): CalendarEvent[] {
  const today = toDateKey(now)
  const limit = now.getTime() + hours * 3600_000
  return events
    .filter((e) => e.date === today && atTime(e.date, e.end).getTime() >= now.getTime() && atTime(e.date, e.start).getTime() <= limit)
    .sort((a, b) => a.start.localeCompare(b.start))
}

export function eventsVisibleTo(events: CalendarEvent[], viewer: PartnerId): CalendarEvent[] {
  return events.filter((e) => e.ownerId === null || e.ownerId === viewer)
}

const spokenTitle = (title: string) => title.replace(/[.!?;:]+/g, ' ').trim().split(/\s+/).slice(0, 5).join(' ')
const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Resumo curto para leitura em voz alta, sem relógio global nem efeitos e com a privacidade do dia. */
export function buildDaySpeechSummary(state: DataState, viewer: PartnerId, now: Date): string {
  const today = toDateKey(now)
  const tasks = tasksForDay(Object.values(state.tasks).filter((task) => canViewTask(task, viewer) && (task.assignedTo === null || task.assignedTo === viewer)), today).filter((task) => task.status === 'PENDING')
  const doses = dosesFor(state, viewer, today, now, false).filter((dose) => dose.view !== 'TAKEN' && dose.view !== 'SKIPPED')
  const events = eventsVisibleTo(Object.values(state.events), viewer).filter((event) => event.date === today && atTime(event.date, event.end).getTime() >= now.getTime())
  const profiles = {
    A: state.profiles.A ?? { sharePersonalFinances: false },
    B: state.profiles.B ?? { sharePersonalFinances: false },
  }
  const bills = visibleTransactions(Object.values(state.transactions), viewer, profiles).filter((tx) => tx.type === 'EXPENSE' && tx.status === 'PREDICTED_DASHED' && tx.competenceDate <= today && (tx.scope === 'COUPLE' || tx.createdBy === viewer))
  const next = nextAction(doses, events, tasks, now)
  let nextSentence: string
  if (next.kind === 'dose') nextSentence = `O próximo cuidado é confirmar seu remédio das ${next.dose.log.scheduledTime}.`
  else if (next.kind === 'event') nextSentence = `Seu próximo compromisso é ${spokenTitle(next.event.title)}, às ${next.event.start}.`
  else if (next.kind === 'task') nextSentence = `Comece por ${spokenTitle(next.task.title)}, no seu ritmo.`
  else if (bills.length) nextSentence = 'Quando puder, confira a próxima conta a pagar.'
  else if (doses.length) nextSentence = `Seu próximo cuidado é o remédio das ${doses[0]!.log.scheduledTime}.`
  else if (events.length) {
    const event = [...events].sort((a, b) => a.start.localeCompare(b.start))[0]!
    nextSentence = `Seu próximo compromisso é ${spokenTitle(event.title)}, às ${event.start}.`
  } else nextSentence = 'Seu dia está sem pendências agendadas por enquanto.'
  const billSentence = bills.length ? `Há ${counted(bills.length, 'conta', 'contas')} para conferir hoje.` : 'Nenhuma conta pendente aparece hoje.'
  return `Vamos com calma. Hoje você tem ${counted(tasks.length, 'tarefa', 'tarefas')}, ${counted(doses.length, 'dose', 'doses')} de remédio e ${counted(events.length, 'compromisso', 'compromissos')} pela frente. ${nextSentence} ${billSentence} Não precisa resolver tudo agora. Um pequeno passo já conta.`
}
