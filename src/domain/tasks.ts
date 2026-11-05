import type { CalendarEvent, DateKey, PartnerId, Task, Transaction } from './types'

export type ScopeFilter = 'ALL' | 'MINE' | 'PARTNER' | 'US'

/** Quem pode ver uma tarefa (matriz de permissões do doc 01) */
export function canViewTask(task: Task, viewer: PartnerId): boolean {
  if (task.status === 'ARCHIVED') return false
  if (task.assignedTo === null) return true
  if (task.assignedTo === viewer) return true
  // tarefa do par: vejo se eu enviei ou se ele(a) deixou visível
  return task.sentBy === viewer || task.visibleToPartner
}

export function matchesScope(owner: PartnerId | null, filter: ScopeFilter, viewer: PartnerId): boolean {
  switch (filter) {
    case 'ALL':
      return true
    case 'MINE':
      return owner === viewer
    case 'PARTNER':
      return owner !== null && owner !== viewer
    case 'US':
      return owner === null
  }
}

export function filterTasks(tasks: Task[], viewer: PartnerId, filter: ScopeFilter): Task[] {
  return tasks.filter((t) => canViewTask(t, viewer) && matchesScope(t.assignedTo, filter, viewer))
}

const effortOrder = (t: Task) => (t.effort === 'QUICK_5M' ? 0 : 1)

/** Tarefas de hoje (inclui atrasadas pendentes), pendentes primeiro, rápidas antes de foco */
export function tasksForDay(tasks: Task[], day: DateKey): Task[] {
  return tasks
    .filter((t) => t.dueDate === day && t.status !== 'ARCHIVED')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'PENDING' ? -1 : 1
      if ((a.dueTime ?? '99') !== (b.dueTime ?? '99')) return (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99')
      return effortOrder(a) - effortOrder(b)
    })
}

/** Pendentes de dias anteriores (para o card calmo "Recomeço") */
export function leftoverTasks(tasks: Task[], today: DateKey): Task[] {
  return tasks.filter((t) => t.status === 'PENDING' && t.dueDate !== null && t.dueDate < today)
}

export const inboxTasks = (tasks: Task[]) => tasks.filter((t) => t.status === 'PENDING' && t.dueDate === null)

export type DayLoad = 'LEVE' | 'MODERADA' | 'ALTA'

/** Carga cognitiva do dia: tarefas de foco pesam 2, rápidas 1, eventos 1 */
export function dayLoad(tasks: Task[], events: CalendarEvent[], bills: Transaction[], day: DateKey): { load: DayLoad; points: number } {
  const t = tasks.filter((x) => x.dueDate === day && x.status !== 'ARCHIVED')
  const points =
    t.reduce((s, x) => s + (x.effort === 'FOCUS' ? 2 : 1), 0) +
    events.filter((e) => e.date === day).length +
    bills.filter((b) => b.competenceDate === day).length
  const load: DayLoad = points <= 2 ? 'LEVE' : points <= 5 ? 'MODERADA' : 'ALTA'
  return { load, points }
}

export function effortLabel(effort: Task['effort']): string {
  return effort === 'QUICK_5M' ? 'Rápida 5 min' : 'Foco'
}
