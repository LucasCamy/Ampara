import { atTime, minutesOf, toDateKey, toTimeKey } from './dates'
import { doseView, emptyLog, isScheduledOn, logId, shouldAlertPartner, type DoseView } from './medication'
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
