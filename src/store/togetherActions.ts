import { formatCents } from '../domain/format'
import { uuid } from '../domain/seed'
import { applyDeposit } from '../domain/together'
import type { DateKey, FocusSession, SavingsGoal } from '../domain/types'
import { dataStore, transact } from './data'
import { ui, uiStore } from './ui'

const nowIso = () => new Date().toISOString()
const viewer = () => uiStore.get().viewer

/* ---------- body doubling ---------- */

export function startFocus(title: string, minutes: number, taskId: string | null = null): string | null {
  const t = title.trim().slice(0, 80)
  if (!t) return null
  const start = new Date()
  const s: FocusSession = {
    id: uuid(),
    startedBy: viewer(),
    title: t,
    taskId,
    durationMin: minutes,
    startedAt: start.toISOString(),
    endsAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
    joinedBy: null,
    status: 'RUNNING',
    updatedAt: start.toISOString(),
  }
  const undo = transact((tx) => tx.put('focusSessions', s))
  ui.toast(`${minutes} min de foco começaram. Seu par foi chamado.`, { undo })
  return s.id
}

export function joinFocus(id: string) {
  const prev = dataStore.get().focusSessions[id]
  if (!prev || prev.status !== 'RUNNING' || prev.startedBy === viewer() || prev.joinedBy) return
  transact((tx) => tx.put('focusSessions', { ...prev, joinedBy: viewer(), updatedAt: nowIso() }))
  ui.toast('Vocês estão juntos nessa', { tone: 'info' })
}

/** Terminamos: fecha a sessão e, se havia tarefa ligada, conclui junto (um Desfazer volta tudo) */
export function finishFocus(id: string) {
  const prev = dataStore.get().focusSessions[id]
  if (!prev || prev.status !== 'RUNNING') return
  const iso = nowIso()
  const undo = transact((tx) => {
    tx.put('focusSessions', { ...prev, status: 'DONE', updatedAt: iso })
    const task = prev.taskId ? tx.get('tasks', prev.taskId) : undefined
    if (task && task.status === 'PENDING') tx.put('tasks', { ...task, status: 'DONE', completedAt: iso, completedBy: viewer(), updatedAt: iso })
  })
  ui.toast(prev.taskId ? 'Feito! Tarefa concluída.' : 'Feito! Bom trabalho, vocês dois.', { undo })
}

export function cancelFocus(id: string) {
  const prev = dataStore.get().focusSessions[id]
  if (!prev || prev.status !== 'RUNNING') return
  const undo = transact((tx) => tx.put('focusSessions', { ...prev, status: 'CANCELLED', updatedAt: nowIso() }))
  ui.toast('Foco encerrado. Tudo bem parar.', { undo })
}

/* ---------- caixinhas ---------- */

export interface GoalInput {
  title: string
  targetCents: number
  deadline: DateKey | null
}

export function saveGoal(input: GoalInput, id?: string): boolean {
  const prev = id ? dataStore.get().savingsGoals[id] : undefined
  if (id && !prev) return false
  const iso = nowIso()
  const g: SavingsGoal = {
    id: prev?.id ?? uuid(),
    title: input.title.trim().slice(0, 60),
    targetCents: input.targetCents,
    savedCents: prev?.savedCents ?? 0,
    deadline: input.deadline,
    createdBy: prev?.createdBy ?? viewer(),
    createdAt: prev?.createdAt ?? iso,
    updatedAt: iso,
  }
  const undo = transact((tx) => tx.put('savingsGoals', g))
  ui.toast(prev ? 'Caixinha atualizada' : `Caixinha criada · ${g.title}`, { undo })
  return true
}

/** Guardar (positivo) ou tirar (negativo) da caixinha */
export function moveGoal(id: string, cents: number) {
  const prev = dataStore.get().savingsGoals[id]
  if (!prev || !cents) return
  const saved = applyDeposit(prev, cents)
  if (saved === prev.savedCents) return
  const undo = transact((tx) => tx.put('savingsGoals', { ...prev, savedCents: saved, updatedAt: nowIso() }))
  const diff = saved - prev.savedCents
  ui.toast(`${diff > 0 ? 'Guardado' : 'Retirado'} ${formatCents(Math.abs(diff))} · ${prev.title}`, { undo })
}

export function deleteGoal(id: string): boolean {
  const prev = dataStore.get().savingsGoals[id]
  if (!prev) return false
  const undo = transact((tx) => tx.remove('savingsGoals', id))
  ui.toast(`Caixinha ${prev.title} excluída`, { undo })
  return true
}
