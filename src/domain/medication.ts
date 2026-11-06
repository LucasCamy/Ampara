import { addDays, atTime, parseDateKey } from './dates'
import type { DateKey, Medication, MedicationLog, PartnerId, SkipReason, TimeKey } from './types'

export const SNOOZE_MS = 5 * 60 * 1000
/** Janela antes do horário em que a dose já aparece como "Agora" */
export const DUE_WINDOW_MIN = 60

export const logId = (medicationId: string, date: DateKey, time: TimeKey) => `${medicationId}@${date}@${time}`

export function emptyLog(med: Medication, date: DateKey, time: TimeKey, nowIso: string): MedicationLog {
  return {
    id: logId(med.id, date, time),
    medicationId: med.id,
    scheduledDate: date,
    scheduledTime: time,
    status: 'PENDING',
    takenAt: null,
    confirmedBy: null,
    snoozeCount: 0,
    snoozeUntil: null,
    skipReason: null,
    updatedAt: nowIso,
  }
}

export function isScheduledOn(med: Medication, date: DateKey): boolean {
  return med.weekdays.length === 0 || med.weekdays.includes(parseDateKey(date).getDay())
}

/** Estado exibido de uma dose: soma o status gravado com o relógio */
export type DoseView = 'TAKEN' | 'SKIPPED' | 'SNOOZED_WATER' | 'UPCOMING' | 'DUE' | 'LATE'

export function doseView(log: MedicationLog, now: Date): DoseView {
  if (log.status === 'TAKEN') return 'TAKEN'
  if (log.status === 'SKIPPED') return 'SKIPPED'
  if (log.status === 'SNOOZED_WATER' && log.snoozeUntil && new Date(log.snoozeUntil) > now) {
    return 'SNOOZED_WATER'
  }
  const scheduled = atTime(log.scheduledDate, log.scheduledTime)
  const diffMin = (now.getTime() - scheduled.getTime()) / 60000
  // snooze vencido volta a pedir confirmação
  if (log.status === 'SNOOZED_WATER') return diffMin > 30 ? 'LATE' : 'DUE'
  if (diffMin > 30) return 'LATE'
  if (diffMin >= -DUE_WINDOW_MIN) return 'DUE'
  return 'UPCOMING'
}

export function minutesLate(log: MedicationLog, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - atTime(log.scheduledDate, log.scheduledTime).getTime()) / 60000))
}

export class DoseTransitionError extends Error {}

/** PENDING -> SNOOZED_WATER (reinicia a contagem de 5 min) */
export function snoozeWater(log: MedicationLog, now: Date): MedicationLog {
  if (log.status === 'TAKEN' || log.status === 'SKIPPED') {
    throw new DoseTransitionError('Dose já resolvida')
  }
  return {
    ...log,
    status: 'SNOOZED_WATER',
    snoozeCount: log.snoozeCount + 1,
    snoozeUntil: new Date(now.getTime() + SNOOZE_MS).toISOString(),
    updatedAt: now.toISOString(),
  }
}

export interface TakeResult {
  log: MedicationLog
  med: Medication
  /** false quando a dose já estava tomada (idempotente, não desconta de novo) */
  changed: boolean
  /** true quando este desconto cruzou o limite de estoque baixo */
  crossedLowStock: boolean
}

/** PENDING | SNOOZED_WATER -> TAKEN, desconta 1 do estoque uma única vez */
export function confirmTaken(log: MedicationLog, med: Medication, by: PartnerId, now: Date): TakeResult {
  if (log.status === 'TAKEN') return { log, med, changed: false, crossedLowStock: false }
  const nowIso = now.toISOString()
  const before = med.stockCount
  const after = before === null ? null : Math.max(0, before - 1)
  const crossedLowStock =
    before !== null && after !== null && before > med.lowStockThreshold && after <= med.lowStockThreshold
  return {
    log: { ...log, status: 'TAKEN', takenAt: nowIso, confirmedBy: by, snoozeUntil: null, skipReason: null, updatedAt: nowIso },
    med: after === before ? med : { ...med, stockCount: after, updatedAt: nowIso },
    changed: true,
    crossedLowStock,
  }
}

export function skipDose(log: MedicationLog, reason: SkipReason, by: PartnerId, now: Date): MedicationLog {
  if (log.status === 'TAKEN') throw new DoseTransitionError('Dose já tomada')
  return {
    ...log,
    status: 'SKIPPED',
    skipReason: reason,
    confirmedBy: by,
    snoozeUntil: null,
    updatedAt: now.toISOString(),
  }
}

/** Rede de apoio: avisar o par quando a dose passa do limite sem confirmação */
export function shouldAlertPartner(med: Medication, log: MedicationLog, now: Date): boolean {
  if (!med.notifyPartnerOnDelay || med.ownerId === null) return false
  if (log.status === 'TAKEN' || log.status === 'SKIPPED') return false
  return minutesLate(log, now) >= med.delayMinutesThreshold
}

export function isLowStock(med: Medication): boolean {
  return med.stockCount !== null && med.stockCount <= med.lowStockThreshold
}

/** Estimativa de quantos dias a caixa dura no ritmo atual */
export function stockDaysLeft(med: Medication): number | null {
  if (med.stockCount === null || med.times.length === 0) return null
  const perWeek = med.times.length * (med.weekdays.length || 7)
  return Math.floor((med.stockCount / perWeek) * 7)
}

/** Dia em que a caixa acaba no ritmo atual (null = sem controle de estoque) */
export function stockRunsOutOn(med: Medication, today: DateKey): DateKey | null {
  const days = stockDaysLeft(med)
  return days === null ? null : addDays(today, days)
}

/** Nível do estoque para a barra: cheio (>= 30 dias), atenção (perto do limite) ou baixo */
export function stockLevel(med: Medication): { ratio: number; level: 'ok' | 'warn' | 'low' } | null {
  const days = stockDaysLeft(med)
  if (days === null || med.stockCount === null) return null
  const level = isLowStock(med) ? 'low' : med.stockCount <= med.lowStockThreshold * 2 || days <= 7 ? 'warn' : 'ok'
  return { ratio: Math.max(0, Math.min(1, days / 30)), level }
}

export function skipReasonLabel(reason: SkipReason): string {
  return { FORGOT: 'Esqueci', OUT_OF_STOCK: 'Acabou o remédio', MEDICAL: 'Orientação médica' }[reason]
}
