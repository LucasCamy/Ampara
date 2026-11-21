import { minutesOf, toDateKey, toTimeKey } from './dates'
import { canViewTask } from './tasks'
import type { DataState, DateKey, PartnerId, TimeKey } from './types'

export type RitualWindow = 'morning' | 'afternoon' | 'evening'
export interface RitualSchedule { enabled: boolean; time: TimeKey }
export type RitualSchedules = Record<RitualWindow, RitualSchedule>
export const RITUAL_WINDOWS: RitualWindow[] = ['morning', 'afternoon', 'evening']

export const RITUAL_LABELS: Record<RitualWindow, string> = {
  morning: 'Começo do dia',
  afternoon: 'Pausa da tarde',
  evening: 'Fechamento leve',
}

export const defaultRitualSchedules = (): RitualSchedules => ({
  morning: { enabled: true, time: '08:30' },
  afternoon: { enabled: false, time: '14:30' },
  evening: { enabled: true, time: '21:00' },
})

/** Preferências antigas ou parciais sempre recebem horários válidos e objetos independentes. */
export function normalizeRitualSchedules(raw: unknown): RitualSchedules {
  const value = raw && typeof raw === 'object' ? raw as Partial<Record<RitualWindow, unknown>> : {}
  const defaults = defaultRitualSchedules()
  return Object.fromEntries(RITUAL_WINDOWS.map((window) => {
    const input = value[window]
    const schedule = input && typeof input === 'object' ? input as Partial<Record<keyof RitualSchedule, unknown>> : {}
    return [window, {
      enabled: typeof schedule.enabled === 'boolean' ? schedule.enabled : defaults[window].enabled,
      time: typeof schedule.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time) ? schedule.time : defaults[window].time,
    }]
  })) as RitualSchedules
}

/** Só a janela mais recente pode aparecer. Concluí-la não faz um ritual antigo reaparecer. */
export function pickRitualWindow(schedules: RitualSchedules, now: Date, done: ReadonlySet<RitualWindow>): RitualWindow | null {
  const current = minutesOf(toTimeKey(now))
  const active = RITUAL_WINDOWS.filter((window) => schedules[window].enabled && minutesOf(schedules[window].time) <= current)
    .sort((a, b) => minutesOf(schedules[b].time) - minutesOf(schedules[a].time) || RITUAL_WINDOWS.indexOf(b) - RITUAL_WINDOWS.indexOf(a))[0]
  return active && !done.has(active) ? active : null
}

/** A data do espaço permanece estável quando ele ganha uma conta na nuvem. */
export const ritualLocalScope = (state: DataState) => state.couple.couple?.pairedAt ?? 'local'
export const ritualDoneKey = (scope: string, viewer: PartnerId, date: DateKey, window: RitualWindow) => `ritual-done:${scope}:${viewer}:${date}:${window}`
export const ritualShownKey = (scope: string, viewer: PartnerId, date: DateKey, window: RitualWindow) => `ritual-shown:${scope}:${viewer}:${date}:${window}`
export const ritualAlertKey = (spaceId: string | null | undefined, viewer: PartnerId, date: DateKey, window: RitualWindow) => `ritual:${spaceId ?? 'local'}:${viewer}:${date}:${window}`

export interface RitualDayProgress { tasksDone: number; dosesTaken: number; pendingTasks: number }

/** Celebra só o que foi concluído hoje pela pessoa e os remédios dela, inclusive doses de ontem tomadas hoje. */
export function ritualDayProgress(state: DataState, viewer: PartnerId, date: DateKey): RitualDayProgress {
  const onDate = (iso: string | null) => !!iso && toDateKey(new Date(iso)) === date
  const tasks = Object.values(state.tasks).filter((task) => canViewTask(task, viewer))
  return {
    tasksDone: tasks.filter((task) => task.status === 'DONE' && task.completedBy === viewer && onDate(task.completedAt)).length,
    dosesTaken: Object.values(state.medLogs).filter((log) => {
      const med = state.meds[log.medicationId]
      return med?.kind === 'MED' && med.ownerId === viewer && log.status === 'TAKEN' && onDate(log.takenAt)
    }).length,
    pendingTasks: tasks.filter((task) => task.status === 'PENDING' && task.dueDate !== null && task.dueDate <= date && (task.assignedTo === viewer || task.assignedTo === null)).length,
  }
}
