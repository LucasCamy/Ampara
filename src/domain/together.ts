import { daysBetween } from './cycle'
import type { DateKey, FocusSession, SavingsGoal } from './types'

/* ---------- body doubling ---------- */

export const FOCUS_DURATIONS = [15, 25, 45] as const

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
