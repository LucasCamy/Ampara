import { addDays, toDateKey } from '../domain/dates'
import { uuid } from '../domain/seed'
import { canViewTask } from '../domain/tasks'
import { buildFocusSession } from '../domain/together'
import type { PartnerId, Task } from '../domain/types'
import { tickNow } from './clock'
import { dataStore, transact, type Tx } from './data'
import { putNewFocus } from './togetherActions'
import { ui, uiStore } from './ui'

const canMove = (task: Task, viewer: PartnerId, today: string) => task.status === 'PENDING' && !!task.dueDate && task.dueDate <= today && (task.assignedTo === viewer || task.assignedTo === null) && canViewTask(task, viewer)

function moveTasks(tx: Tx, viewer: PartnerId, today: string, iso: string, gentle: boolean, keepTaskId?: string | null): number {
  let moved = 0
  for (const task of Object.values(tx.state().tasks)) {
    if (!canMove(task, viewer, today) || task.id === keepTaskId || (gentle && task.dueTime)) continue
    tx.put('tasks', { ...task, dueDate: addDays(today, 1), postponeCount: (task.postponeCount ?? 0) + 1, updatedAt: iso })
    moved++
  }
  return moved
}

/** Horário marcado é tratado como urgente. Compromissos, contas e remédios continuam intactos. */
export function reliefToday(keepTaskId?: string | null): number {
  const viewer = uiStore.get().viewer
  const now = new Date()
  const iso = now.toISOString()
  let moved = 0
  const undo = transact((tx) => {
    const profile = tx.get('profiles', viewer)
    if (profile) tx.put('profiles', { ...profile, energy: 'OVERLOAD', energyUpdatedAt: iso, updatedAt: iso })
    moved = moveTasks(tx, viewer, toDateKey(now), iso, true, keepTaskId)
  })
  ui.toast(moved ? `${moved} ${moved === 1 ? 'tarefa foi' : 'tarefas foram'} para amanhã. Modo calmo ativado.` : 'Modo calmo ativado. Seu próximo passo pode ser pequeno.', { undo })
  return moved
}

/** Fechamento do dia: move apenas pendências minhas ou compartilhadas, em uma operação com Desfazer. */
export function movePendingToTomorrow(): number {
  const viewer = uiStore.get().viewer
  const now = new Date()
  let moved = 0
  const undo = transact((tx) => { moved = moveTasks(tx, viewer, toDateKey(now), now.toISOString(), false) })
  ui.toast(moved ? `${moved} ${moved === 1 ? 'pendência ficou' : 'pendências ficaram'} para amanhã. Por hoje, basta.` : 'Nenhuma pendência para mover. Por hoje, basta.', { undo })
  return moved
}

/** Micro-passo e foco entram juntos na fila: Desfazer volta os dois. */
export function startUnstuckFocus(input: { taskId: string | null; title: string; microStep?: string }): string | null {
  const viewer = uiStore.get().viewer
  const now = new Date()
  const iso = now.toISOString()
  const state = dataStore.get()
  let task = input.taskId ? state.tasks[input.taskId] : undefined
  if (input.taskId && (!task || task.status !== 'PENDING' || (task.assignedTo !== null && task.assignedTo !== viewer) || !canViewTask(task, viewer))) return null
  const microStep = input.microStep?.trim().slice(0, 80)
  if (input.microStep !== undefined && !microStep) return null
  if (microStep && !task) {
    task = {
      id: uuid(), title: microStep, assignedTo: viewer, createdBy: viewer, effort: 'QUICK_5M', status: 'PENDING',
      dueDate: toDateKey(now), dueTime: null, visibleToPartner: false, sentBy: null, completedAt: null, completedBy: null,
      sourceMedicationId: null, steps: [{ id: uuid(), text: microStep, done: false }], postponeCount: 0, createdAt: iso, updatedAt: iso,
    }
  } else if (task && microStep && !task.steps?.some((step) => !step.done && step.text.trim().slice(0, 80) === microStep) && (task.steps?.length ?? 0) < 3) {
    task = { ...task, steps: [...(task.steps ?? []), { id: uuid(), text: microStep, done: false }], updatedAt: iso }
  }
  const session = buildFocusSession({ id: uuid(), title: microStep ?? input.title, minutes: 5, taskId: task?.id ?? null, startedBy: viewer }, now)
  if (!session) return null
  // A própria pessoa ocupa a vaga: o fluxo individual não envia convite ao par.
  session.joinedBy = viewer
  const focusTask = task
  const undo = transact((tx) => {
    if (focusTask && state.tasks[focusTask.id] !== focusTask) tx.put('tasks', focusTask)
    putNewFocus(tx, session)
  })
  tickNow()
  ui.toast('5 min para um começo possível. Você pode parar quando precisar.', { undo })
  return session.id
}
