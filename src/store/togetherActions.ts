import { formatCents } from '../domain/format'
import { uuid } from '../domain/seed'
import { applyDeposit, buildFocusSession, canViewFocusSession } from '../domain/together'
import { canViewTask } from '../domain/tasks'
import type { DateKey, FocusSession, SavingsGoal } from '../domain/types'
import { otherPartner } from '../domain/types'
import { tickNow } from './clock'
import { dataStore, transact, type Tx } from './data'
import { ui, uiStore } from './ui'

const nowIso = () => new Date().toISOString()
const viewer = () => uiStore.get().viewer

/* ---------- body doubling ---------- */

/** Um foco novo substitui somente o foco anterior de quem começou, preservando o do par. */
export function putNewFocus(tx: Tx, session: FocusSession): void {
  for (const previous of Object.values(tx.state().focusSessions)) {
    if (previous.status === 'RUNNING' && previous.startedBy === session.startedBy) {
      tx.put('focusSessions', { ...previous, status: 'CANCELLED', updatedAt: session.startedAt })
    }
  }
  tx.put('focusSessions', session)
}

export function startFocus(title: string, minutes: number, taskId: string | null = null, selfOnly = false): string | null {
  const state = dataStore.get()
  const task = taskId ? state.tasks[taskId] : undefined
  if (taskId && (!task || !canViewTask(task, viewer()))) return null
  const s = buildFocusSession({ id: uuid(), title, minutes, taskId, startedBy: viewer() }, new Date())
  if (!s) return null
  const individual = selfOnly || state.couple.couple?.mode === 'SOLO' || (!!task && !canViewTask(task, otherPartner(viewer())))
  if (individual) s.joinedBy = s.startedBy
  const undo = transact((tx) => putNewFocus(tx, s))
  tickNow()
  ui.toast(individual ? `${minutes} min de foco começaram. Um passo por vez.` : `${minutes} min de foco começaram. Seu par foi chamado.`, { undo })
  return s.id
}

export function joinFocus(id: string) {
  if (dataStore.get().couple.couple?.mode === 'SOLO') return
  const prev = dataStore.get().focusSessions[id]
  if (!prev || prev.status !== 'RUNNING' || prev.startedBy === viewer() || prev.joinedBy || !canViewFocusSession(prev, viewer(), dataStore.get().tasks)) return
  transact((tx) => tx.put('focusSessions', { ...prev, joinedBy: viewer(), updatedAt: nowIso() }))
  ui.toast('Vocês estão juntos nessa', { tone: 'info' })
}

/** Terminamos: fecha a sessão e, se havia tarefa ligada, conclui junto (um Desfazer volta tudo) */
export function finishFocus(id: string) {
  const prev = dataStore.get().focusSessions[id]
  if (!prev || prev.status !== 'RUNNING' || !canViewFocusSession(prev, viewer(), dataStore.get().tasks)) return
  const iso = nowIso()
  let completedTask = false
  let completedStep = false
  const undo = transact((tx) => {
    tx.put('focusSessions', { ...prev, status: 'DONE', updatedAt: iso })
    const task = prev.taskId ? tx.get('tasks', prev.taskId) : undefined
    if (!task || task.status !== 'PENDING' || !canViewTask(task, viewer())) return
    const steps = [...(task.steps ?? [])]
    const matchingStep = steps.findIndex((step) => !step.done && step.text.trim().slice(0, 80) === prev.title)
    if (matchingStep >= 0) {
      steps[matchingStep] = { ...steps[matchingStep]!, done: true }
      completedStep = true
    }
    const done = steps.length === 0 || steps.every((step) => step.done)
    completedTask = done
    if (done || completedStep) tx.put('tasks', { ...task, steps, status: done ? 'DONE' : 'PENDING', completedAt: done ? iso : null, completedBy: done ? viewer() : null, updatedAt: iso })
  })
  const solo = dataStore.get().couple.couple?.mode === 'SOLO' || prev.joinedBy === prev.startedBy
  ui.toast(completedTask ? 'Feito! Tarefa concluída.' : completedStep ? 'Micro-passo feito. O resto pode continuar depois.' : solo ? 'Foco encerrado. Esse começo já conta.' : 'Feito! Bom trabalho, vocês dois.', { undo })
}

/** Mais dez minutos a partir de agora quando o tempo já terminou, sem acumular tempo de espera. */
export function extendFocus(id: string): boolean {
  const previous = dataStore.get().focusSessions[id]
  if (!previous || previous.status !== 'RUNNING' || previous.durationMin > 110 || !canViewFocusSession(previous, viewer(), dataStore.get().tasks)) return false
  const now = new Date()
  const endsAt = new Date(Math.max(now.getTime(), new Date(previous.endsAt).getTime()) + 10 * 60_000).toISOString()
  const undo = transact((tx) => tx.put('focusSessions', { ...previous, durationMin: previous.durationMin + 10, endsAt, updatedAt: now.toISOString() }))
  tickNow()
  ui.toast('Mais 10 min de foco. Um trecho por vez.', { undo })
  return true
}

export function toggleTaskStep(taskId: string, stepId: string): boolean {
  const task = dataStore.get().tasks[taskId]
  const step = task?.steps?.find((item) => item.id === stepId)
  if (!task || !step || !canViewTask(task, viewer())) return false
  const reopen = step.done && task.status === 'DONE'
  const undo = transact((tx) => tx.put('tasks', {
    ...task,
    steps: task.steps!.map((item) => item.id === stepId ? { ...item, done: !item.done } : item),
    ...(reopen ? { status: 'PENDING', completedAt: null, completedBy: null } as const : {}),
    updatedAt: nowIso(),
  }))
  ui.toast(step.done ? 'Micro-passo reaberto' : 'Micro-passo feito', { undo })
  return true
}

export function cancelFocus(id: string) {
  const prev = dataStore.get().focusSessions[id]
  if (!prev || prev.status !== 'RUNNING' || !canViewFocusSession(prev, viewer(), dataStore.get().tasks)) return
  const undo = transact((tx) => tx.put('focusSessions', { ...prev, status: 'CANCELLED', updatedAt: nowIso() }))
  ui.toast('Foco encerrado. Tudo bem parar.', { undo })
}

export function pauseFocus(id: string): void {
  const previous = dataStore.get().focusSessions[id]
  if (!previous || previous.status !== 'RUNNING' || !canViewFocusSession(previous, viewer(), dataStore.get().tasks)) return
  const undo = transact((tx) => tx.put('focusSessions', { ...previous, status: 'CANCELLED', updatedAt: nowIso() }))
  ui.toast('Pausa feita. Você pode voltar quando quiser.', { undo })
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
