import { daysBetween } from './cycle'
import { canViewTask } from './tasks'
import type { DateKey, FocusSession, PartnerId, SavingsGoal, Task } from './types'

/* ---------- body doubling ---------- */

export const FOCUS_DURATIONS = [5, 15, 25, 45] as const

/** Um foco individual ou ligado a uma tarefa privada nunca revela o título ao par. */
export function canViewFocusSession(session: FocusSession, viewer: PartnerId, tasks: Record<string, Task>): boolean {
  if (session.startedBy === viewer) return true
  if (session.joinedBy === session.startedBy) return false
  const task = session.taskId ? tasks[session.taskId] : undefined
  return !session.taskId || (!!task && canViewTask(task, 'A') && canViewTask(task, 'B'))
}

/** O mesmo começo de foco é usado no formulário e no fluxo Travei. */
export function buildFocusSession(input: { id: string; title: string; minutes: number; startedBy: PartnerId; taskId?: string | null }, now: Date): FocusSession | null {
  const title = input.title.trim().slice(0, 80)
  if (!title || !FOCUS_DURATIONS.some((duration) => duration === input.minutes) || !Number.isFinite(now.getTime())) return null
  const iso = now.toISOString()
  return {
    id: input.id,
    title,
    startedBy: input.startedBy,
    taskId: input.taskId ?? null,
    durationMin: input.minutes,
    startedAt: iso,
    endsAt: new Date(now.getTime() + input.minutes * 60_000).toISOString(),
    joinedBy: null,
    status: 'RUNNING',
    updatedAt: iso,
  }
}

export type FocusView =
  | { state: 'running'; minutesLeft: number; endsAtLabel: string }
  /** o tempo acabou mas ninguém marcou "terminamos" */
  | { state: 'finished' }
  | { state: 'closed' }

const hhmm = (iso: string) => new Date(iso).toTimeString().slice(0, 5)

export function focusView(s: FocusSession, now: Date): FocusView {
  if (s.status !== 'RUNNING') return { state: 'closed' }
  const ms = new Date(s.endsAt).getTime() - now.getTime()
  if (ms <= 0) return { state: 'finished' }
  return { state: 'running', minutesLeft: Math.ceil(ms / 60_000), endsAtLabel: hhmm(s.endsAt) }
}

/** Sessão aberta (rodando ou acabou sem fechar) mais recente; sessões de outro dia não contam */
export function activeFocus(all: FocusSession[], now: Date): FocusSession | undefined {
  const dayAgo = now.getTime() - 12 * 3600_000
  return all
    .filter((s) => s.status === 'RUNNING' && new Date(s.startedAt).getTime() > dayAgo)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
}

/* ---------- caixinhas ---------- */

export interface GoalView {
  ratio: number
  remainingCents: number
  done: boolean
  /** com prazo: quanto guardar por mês até lá (arredonda para cima) */
  perMonthCents: number | null
  monthsLeft: number | null
  overdue: boolean
}

export function goalView(g: SavingsGoal, today: DateKey): GoalView {
  const remaining = Math.max(0, g.targetCents - g.savedCents)
  const done = remaining === 0
  let perMonth: number | null = null
  let months: number | null = null
  let overdue = false
  if (g.deadline && !done) {
    const days = daysBetween(today, g.deadline)
    overdue = days < 0
    months = overdue ? 0 : Math.max(1, Math.ceil(days / 30.44))
    perMonth = overdue ? remaining : Math.ceil(remaining / months)
  }
  return { ratio: g.targetCents ? Math.min(1, g.savedCents / g.targetCents) : 0, remainingCents: remaining, done, perMonthCents: perMonth, monthsLeft: months, overdue }
}

/** Depósito (positivo) ou retirada (negativo): nunca deixa a caixinha negativa */
export function applyDeposit(g: SavingsGoal, cents: number): number {
  return Math.max(0, g.savedCents + Math.trunc(cents))
}
