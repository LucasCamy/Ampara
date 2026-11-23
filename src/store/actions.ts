import {
  buildEvent,
  buildMedication,
  buildRoutine,
  hasErrors,
  isDateKey,
  validateEvent,
  validateMedication,
  validateRoutine,
  type EventInput,
  type MedicationInput,
  type RoutineInput,
} from '../domain/catalog'
import { addDays, parseDateKey, toDateKey } from '../domain/dates'
import { buildSettlement, computeCoupleBalance, computeShares, nonPayerShare } from '../domain/finance'
import { firstName, formatCents } from '../domain/format'
import { dayInMonth, payTx } from '../domain/ledger'
import { confirmTaken, emptyLog, logId, skipDose, snoozeWater } from '../domain/medication'
import { defaultEnabledModules, uuid } from '../domain/seed'
import { canViewTask } from '../domain/tasks'
import type {
  EnergyLevel,
  EnabledModules,
  HelpRequest,
  HelpResponse,
  HelpType,
  Medication,
  MedicationLog,
  PartnerId,
  SkipReason,
  SplitMode,
  SplitRule,
  Task,
  TaskEffort,
  Transaction,
  TxCategory,
  TxStatus,
  Urgency,
} from '../domain/types'
import { otherPartner } from '../domain/types'
import { tickNow } from './clock'
import { dataStore, transact, type Tx } from './data'
import { ui, uiStore } from './ui'

const nowIso = () => new Date().toISOString()
const today = () => toDateKey(new Date())
const viewer = () => uiStore.get().viewer
const nameOf = (id: PartnerId) => firstName(dataStore.get().profiles[id]?.displayName) || (id === 'A' ? 'Parceiro A' : 'Parceira B')

const ENERGY_LABEL: Record<EnergyLevel, string> = { FULL: '100% cheia', MEDIUM: '50% média', OVERLOAD: '10% modo sobrecarga' }

export function setEnergy(level: EnergyLevel) {
  const who = viewer()
  const prev = dataStore.get().profiles[who]
  if (!prev || prev.energy === level) return
  transact((tx) => tx.put('profiles', { ...prev, energy: level, energyUpdatedAt: nowIso(), updatedAt: nowIso() }))
  ui.toast(`Bateria mental: ${ENERGY_LABEL[level]}`, { tone: 'info' })
}

export function setSharePersonal(value: boolean) {
  const who = viewer()
  const prev = dataStore.get().profiles[who]
  if (!prev) return
  const undo = transact((tx) => tx.put('profiles', { ...prev, sharePersonalFinances: value, updatedAt: nowIso() }))
  ui.toast(value ? 'Seu par pode ver seus gastos pessoais (sem presentes)' : 'Sua visão pessoal está fechada para o par', { undo })
}

export function setEnabledModule(module: keyof EnabledModules, enabled: boolean) {
  const who = viewer()
  const state = dataStore.get()
  const profile = state.profiles[who]
  if (!profile) return
  const enabledModules = { ...defaultEnabledModules(state.couple.couple?.mode ?? 'COUPLE'), ...profile.enabledModules }
  if (enabledModules[module] === enabled) return
  const undo = transact((tx) => tx.put('profiles', { ...profile, enabledModules: { ...enabledModules, [module]: enabled }, updatedAt: nowIso() }))
  const label = { cycle: 'Ciclo', shopping: 'Compras', goals: 'Caixinhas', ideas: 'Ideias' }[module]
  ui.toast(`${label}: ${enabled ? 'ativado' : 'desativado'}`, { undo })
}

export function renameProfile(id: PartnerId, displayName: string) {
  const prev = dataStore.get().profiles[id]
  const name = displayName.trim()
  if (!prev || !name || prev.displayName === name) return
  transact((tx) => tx.put('profiles', { ...prev, displayName: name.slice(0, 24), updatedAt: nowIso() }))
}

export function setSplit(splitMode: SplitMode, ratioABps: number) {
  const prev = dataStore.get().couple.couple
  if (!prev) return
  transact((tx) => tx.put('couple', { ...prev, splitMode, ratioABps: Math.min(9500, Math.max(500, Math.round(ratioABps))) }))
}

/* ---------- Tarefas ---------- */

export type TaskDest = 'ME' | 'US' | 'PARTNER'
export type TaskWhen = 'TODAY' | 'TOMORROW' | 'INBOX'

export interface TaskInput {
  title: string
  dest: TaskDest
  when: TaskWhen
  effort: TaskEffort
  private?: boolean
  steps?: Task['steps']
  /** Usada ao editar uma tarefa com data própria ou por uma captura com data explícita. */
  dueDate?: Task['dueDate']
}

/** Salva sem apagar o histórico nem os micro-passos concluídos em outro lugar enquanto a gaveta estava aberta. */
export function saveTask(input: TaskInput, id?: string): string | null {
  const who = viewer()
  const state = dataStore.get()
  const prev = id ? state.tasks[id] : undefined
  if (!input.title.trim() || (input.dueDate != null && (!isDateKey(input.dueDate) || toDateKey(parseDateKey(input.dueDate)) !== input.dueDate)) || (id && (!prev || !canViewTask(prev, who)))) return null
  const solo = state.couple.couple?.mode === 'SOLO'
  const dest = solo ? 'ME' : input.dest
  const assignedTo = solo && prev ? prev.assignedTo : dest === 'US' ? null : dest === 'ME' ? who : otherPartner(who)
  const stepIds = new Set<string>()
  const steps = (input.steps ?? prev?.steps ?? [])
    .filter((step) => step.text.trim())
    .slice(0, 3)
    .map((step) => {
      const stepId = step.id && !stepIds.has(step.id) ? step.id : uuid()
      stepIds.add(stepId)
      const current = prev?.steps?.find((item) => item.id === stepId)
      return { id: stepId, text: step.text.trim().slice(0, 120), done: current?.done ?? step.done }
    })
  const t = today()
  const task: Task = {
    id: prev?.id ?? uuid(),
    createdBy: prev?.createdBy ?? who,
    assignedTo,
    title: input.title.trim().slice(0, 120),
    effort: input.effort,
    status: prev?.status ?? 'PENDING',
    dueDate: input.dueDate !== undefined ? input.dueDate : input.when === 'TODAY' ? t : input.when === 'TOMORROW' ? addDays(t, 1) : null,
    dueTime: prev?.dueTime ?? null,
    visibleToPartner: solo && prev ? prev.visibleToPartner : solo ? false : dest === 'ME' ? !input.private : true,
    sentBy: prev && prev.assignedTo === assignedTo ? prev.sentBy : dest === 'PARTNER' ? who : null,
    completedAt: prev?.completedAt ?? null,
    completedBy: prev?.completedBy ?? null,
    sourceMedicationId: prev?.sourceMedicationId ?? null,
    steps,
    postponeCount: prev?.postponeCount ?? 0,
    createdAt: prev?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  }
  const undo = transact((tx) => tx.put('tasks', task))
  const where = task.dueDate === null ? 'a Caixa de Entrada' : task.dueDate === t ? 'hoje' : task.dueDate === addDays(t, 1) ? 'amanhã' : dayMonth(task.dueDate)
  const msg = prev ? `Tarefa atualizada: ${task.title}` : dest === 'PARTNER' ? `Enviada para ${nameOf(otherPartner(who))} com carinho` : `Tarefa salva para ${where}`
  ui.toast(msg, { undo })
  return task.id
}

export const addTask = (input: TaskInput) => saveTask(input)

export function toggleTask(id: string) {
  const who = viewer()
  const task = dataStore.get().tasks[id]
  if (!task) return
  const done = task.status !== 'DONE'
  const undo = transact((tx) =>
    tx.put('tasks', {
      ...task,
      status: done ? 'DONE' : 'PENDING',
      completedAt: done ? nowIso() : null,
      completedBy: done ? who : null,
      updatedAt: nowIso(),
    }),
  )
  ui.toast(done ? `Concluída: ${task.title}` : `Reaberta: ${task.title}`, { undo })
}

export function postponeTask(id: string) {
  const task = dataStore.get().tasks[id]
  if (!task) return
  const base = task.dueDate && task.dueDate >= today() ? task.dueDate : today()
  const undo = transact((tx) => tx.put('tasks', { ...task, dueDate: addDays(base, 1), postponeCount: (task.postponeCount ?? 0) + 1, updatedAt: nowIso() }))
  ui.toast(`Adiada para amanhã: ${task.title}`, { undo })
}

export function scheduleTaskToday(id: string) {
  const task = dataStore.get().tasks[id]
  if (!task) return
  const undo = transact((tx) => tx.put('tasks', { ...task, dueDate: today(), updatedAt: nowIso() }))
  ui.toast(`Trazida para hoje: ${task.title}`, { undo })
}

export function sendTaskToPartner(id: string) {
  if (dataStore.get().couple.couple?.mode === 'SOLO') return
  const who = viewer()
  const task = dataStore.get().tasks[id]
  if (!task) return
  const to = otherPartner(who)
  const undo = transact((tx) => tx.put('tasks', { ...task, assignedTo: to, sentBy: who, visibleToPartner: true, updatedAt: nowIso() }))
  ui.toast(`Enviada para ${nameOf(to)}: ${task.title}`, { undo })
}

export function archiveTasks(ids: string[]) {
  const undo = transact((tx) => {
    for (const id of ids) {
      const t = tx.get('tasks', id)
      if (t) tx.put('tasks', { ...t, status: 'ARCHIVED', updatedAt: nowIso() })
    }
  })
  ui.toast(`${ids.length === 1 ? '1 item arquivado' : `${ids.length} itens arquivados`}. Recomeço leve.`, { undo })
}

export function bringTasksToToday(ids: string[]) {
  const t = today()
  const undo = transact((tx) => {
    for (const id of ids) {
      const task = tx.get('tasks', id)
      if (task) tx.put('tasks', { ...task, dueDate: t, updatedAt: nowIso() })
    }
  })
  ui.toast('Trazidos para hoje', { undo })
}

/* ---------- Finanças ---------- */

export interface ExpenseInput {
  amountCents: number
  description: string
  category: TxCategory
  scope: 'COUPLE' | 'PERSONAL'
  paidBy: PartnerId
  splitRule: SplitRule
  isSecretGift: boolean
  status: TxStatus
  date?: string
}

export function addExpense(input: ExpenseInput) {
  const who = viewer()
  const state = dataStore.get()
  const couple = state.couple.couple
  if (!couple) return
  const solo = couple.mode === 'SOLO'
  const isCouple = !solo && input.scope === 'COUPLE'
  const paidBy = isCouple ? input.paidBy : who
  const shares = isCouple
    ? computeShares(input.amountCents, input.splitRule, paidBy, couple.ratioABps)
    : who === 'A'
      ? { partnerAShareCents: input.amountCents, partnerBShareCents: 0 }
      : { partnerAShareCents: 0, partnerBShareCents: input.amountCents }
  const tx: Transaction = {
    id: uuid(),
    createdBy: who,
    paidBy,
    scope: solo ? 'PERSONAL' : input.scope,
    isSecretGift: !solo && !isCouple && input.isSecretGift,
    type: 'EXPENSE',
    status: input.status,
    amountCents: input.amountCents,
    category: input.category,
    description: input.description.trim(),
    splitRule: isCouple ? input.splitRule : null,
    ...shares,
    competenceDate: input.date ?? today(),
    updatedAt: nowIso(),
  }
  const undo = transact((t) => t.put('transactions', tx))
  let msg = `Gasto salvo · ${formatCents(tx.amountCents)} · ${tx.description}`
  if (isCouple && tx.status === 'CONFIRMED_SOLID') {
    const np = nonPayerShare(tx)
    const label = np.who === who ? 'Sua parte' : `Parte de ${nameOf(np.who)}`
    msg = `Gasto salvo · ${label}: ${formatCents(np.cents)} no acerto do mês`
  } else if (tx.status === 'PREDICTED_DASHED') {
    msg = `Previsto salvo · ${formatCents(tx.amountCents)} · ${tx.description}`
  } else if (tx.isSecretGift) {
    msg = 'Presente salvo · oculto para o par'
  }
  ui.toast(msg, { undo })
}

/** Baixa rápida (Hoje e Finanças): valor previsto, hoje. O mês de competência não muda (ver domain/ledger). */
export function markBillPaid(id: string, paidBy: PartnerId) {
  const state = dataStore.get()
  const tx = state.transactions[id]
  const couple = state.couple.couple
  if (!tx || !couple) return
  const undo = transact((t) => t.put('transactions', payTx(tx, { amountCents: tx.amountCents, paidBy, paidAt: today() }, couple.ratioABps, nowIso())))
  ui.toast(`Pago: ${tx.description} · ${formatCents(tx.amountCents)}`, { undo })
}

export function settleMonth(month = today().slice(0, 7)) {
  const who = viewer()
  const balance = computeCoupleBalance(Object.values(dataStore.get().transactions), month)
  const date = month === today().slice(0, 7) ? today() : dayInMonth(month, 31)
  const settlement = buildSettlement(balance.netCents, who, date, uuid(), nowIso())
  if (!settlement) return
  const undo = transact((t) => t.put('transactions', settlement))
  ui.toast(`Acerto registrado · ${formatCents(settlement.amountCents)} · Contas em dia`, { undo })
}

/* ---------- Remédios e rotinas ---------- */

function ensureLog(tx: Tx, medId: string, date: string, time: string): MedicationLog | null {
  const med = tx.get('meds', medId)
  if (!med) return null
  return tx.get('medLogs', logId(medId, date, time)) ?? emptyLog(med, date, time, nowIso())
}

export function takeDose(medId: string, date: string, time: string) {
  const who = viewer()
  const now = new Date()
  let message = ''
  let alreadyBy: { by: PartnerId | null; at: string | null } | null = null
  const undo = transact((tx) => {
    const log = ensureLog(tx, medId, date, time)
    const med = tx.get('meds', medId)
    if (!log || !med) return
    const r = confirmTaken(log, med, who, now)
    if (!r.changed) {
      alreadyBy = { by: log.confirmedBy, at: log.takenAt }
      return
    }
    tx.put('medLogs', r.log)
    if (r.med !== med) tx.put('meds', r.med)
    const routine = med.kind === 'ROUTINE'
    message = routine
      ? `Feito: ${med.name}`
      : `Tomado às ${now.toTimeString().slice(0, 5)} · ${med.name}${r.med.stockCount !== null ? ` · restam ${r.med.stockCount}` : ''}`
    if (r.crossedLowStock) {
      const exists = Object.values(tx.state().tasks).some((t) => t.sourceMedicationId === med.id && t.status === 'PENDING')
      if (!exists) {
        tx.put('tasks', {
          id: uuid(),
          createdBy: who,
          assignedTo: med.ownerId ?? (tx.state().couple.couple?.mode === 'SOLO' ? who : null),
          title: routine ? `Repor ${med.name}` : `Comprar ${med.name} / pedir receita`,
          effort: 'QUICK_5M',
          status: 'PENDING',
          dueDate: today(),
          dueTime: null,
          visibleToPartner: tx.state().couple.couple?.mode !== 'SOLO' && (med.ownerId === null || med.notifyPartnerOnDelay),
          sentBy: null,
          completedAt: null,
          completedBy: null,
          sourceMedicationId: med.id,
          steps: [],
          postponeCount: 0,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        })
        message += ' · Estoque baixo: tarefa de compra criada'
      }
    }
  })
  tickNow()
  if (alreadyBy) {
    const a = alreadyBy as { by: PartnerId | null; at: string | null }
    const by = a.by === who ? 'Você' : a.by ? nameOf(a.by) : 'Alguém'
    ui.toast(`${by} já confirmou este item${a.at ? ` às ${new Date(a.at).toTimeString().slice(0, 5)}` : ''}`, { tone: 'info' })
    return
  }
  ui.toast(message, { undo })
}

export function snoozeDose(medId: string, date: string, time: string) {
  const undo = transact((tx) => {
    const log = ensureLog(tx, medId, date, time)
    if (!log || log.status === 'TAKEN' || log.status === 'SKIPPED') return
    tx.put('medLogs', snoozeWater(log, new Date()))
  })
  tickNow()
  ui.toast('Pegando água · lembro de novo em 5 min', { undo, tone: 'warn' })
}

export function skipDoseAction(medId: string, date: string, time: string, reason: SkipReason) {
  const who = viewer()
  const undo = transact((tx) => {
    const log = ensureLog(tx, medId, date, time)
    if (!log || log.status === 'TAKEN') return
    tx.put('medLogs', skipDose(log, reason, who, new Date()))
  })
  ui.toast('Dose pulada e registrada', { undo, tone: 'info' })
}

/** Tarefas automáticas de reposição acompanham a privacidade do remédio, sem recolher envios explícitos. */
function hidePrivateRestockTasks(tx: Tx, med: Medication) {
  if (med.ownerId === null || med.notifyPartnerOnDelay) return
  for (const task of Object.values(tx.state().tasks)) {
    if (task.sourceMedicationId === med.id && task.assignedTo === med.ownerId && task.sentBy === null && task.visibleToPartner) {
      tx.put('tasks', { ...task, visibleToPartner: false, updatedAt: med.updatedAt })
    }
  }
}

export function setPartnerSupport(medId: string, value: boolean) {
  const med = dataStore.get().meds[medId]
  if (!med || med.ownerId !== viewer()) return
  const updated = { ...med, notifyPartnerOnDelay: dataStore.get().couple.couple?.mode === 'SOLO' ? false : value, updatedAt: nowIso() }
  const undo = transact((tx) => {
    tx.put('meds', updated)
    hidePrivateRestockTasks(tx, updated)
  })
  ui.toast(updated.notifyPartnerOnDelay ? `Rede de apoio ligada para ${med.name}` : `Rede de apoio desligada para ${med.name}`, { undo })
}

export function restock(medId: string, amount: number) {
  const med = dataStore.get().meds[medId]
  if (!med || med.stockCount === null) return
  const undo = transact((tx) => tx.put('meds', { ...med, stockCount: med.stockCount! + amount, updatedAt: nowIso() }))
  ui.toast(`+${amount} unidades em ${med.name}`, { undo })
}

/* ---------- Cadastros: remédio, rotina, compromisso ---------- */

/** "08:00", "08:00 e 20:00", "08:00, 14:00 e 20:00" */
const listTimes = (times: string[]) => (times.length <= 1 ? (times[0] ?? '') : `${times.slice(0, -1).join(', ')} e ${times[times.length - 1]}`)
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`

/** Remédio que quem está usando pode editar/excluir: só os próprios */
const ownMed = (id: string) => {
  const m = dataStore.get().meds[id]
  return m && m.kind === 'MED' && m.ownerId === viewer() ? m : null
}
const routineOf = (id: string) => {
  const m = dataStore.get().meds[id]
  return m && m.kind === 'ROUTINE' ? m : null
}
/** Compromisso visível para quem está usando: do casal ou próprio */
const editableEvent = (id: string) => {
  const e = dataStore.get().events[id]
  return e && (e.ownerId === null || e.ownerId === viewer()) ? e : null
}

/**
 * Salva remédio novo (sem id) ou a edição de um existente (com id), no nome de quem está com a sessão aberta.
 * Devolve o id, ou null se a entrada for inválida ou o remédio não puder ser editado por esta pessoa.
 */
export function saveMedication(input: MedicationInput, id?: string): string | null {
  const draft = dataStore.get().couple.couple?.mode === 'SOLO' ? { ...input, shareWithPartner: false } : input
  if (hasErrors(validateMedication(draft, today()))) return null
  const prev = id ? ownMed(id) : undefined
  if (id && !prev) return null
  const med = buildMedication(draft, viewer(), uuid(), nowIso(), prev ?? undefined)
  const undo = transact((tx) => {
    tx.put('meds', med)
    hidePrivateRestockTasks(tx, med)
  })
  const support = med.notifyPartnerOnDelay ? ' · com rede de apoio' : ''
  ui.toast(prev ? `Remédio atualizado · ${med.name}` : `Remédio salvo · ${med.name} às ${listTimes(med.times)}${support}`, { undo })
  return med.id
}

export function saveRoutine(input: RoutineInput, id?: string): string | null {
  const draft: RoutineInput = dataStore.get().couple.couple?.mode === 'SOLO' ? { ...input, responsible: 'ME' } : input
  if (hasErrors(validateRoutine(draft))) return null
  const prev = id ? routineOf(id) : undefined
  if (id && !prev) return null
  const routine = buildRoutine(draft, viewer(), uuid(), nowIso(), prev ?? undefined)
  const undo = transact((tx) => tx.put('meds', routine))
  ui.toast(prev ? `Rotina atualizada · ${routine.name}` : `Rotina salva · ${routine.name} às ${listTimes(routine.times)}`, { undo })
  return routine.id
}

export function saveEvent(input: EventInput, id?: string): string | null {
  const prev = id ? editableEvent(id) : undefined
  if (id && !prev) return null
  const solo = dataStore.get().couple.couple?.mode === 'SOLO'
  const draft: EventInput = solo ? { ...input, owner: prev?.ownerId === null ? 'US' : 'ME' } : input
  if (hasErrors(validateEvent(draft))) return null
  const ev = buildEvent(draft, viewer(), uuid(), nowIso(), prev ?? undefined)
  const undo = transact((tx) => tx.put('events', ev))
  ui.toast(`${prev ? 'Compromisso atualizado' : 'Compromisso salvo'} · ${dayMonth(ev.date)} das ${ev.start} às ${ev.end}`, { undo })
  return ev.id
}

export const addMedication = (input: MedicationInput) => saveMedication(input)
export const addRoutine = (input: RoutineInput) => saveRoutine(input)
export const addEvent = (input: EventInput) => saveEvent(input)

/**
 * Excluir na hora, com Desfazer (regra 8). Registros de doses antigas ficam no histórico.
 * A tarefa automática "Repor estoque" ainda pendente sai junto (sem remédio ela não faz sentido) e o
 * Desfazer devolve os dois na mesma operação. Tarefa já concluída fica no histórico.
 */
export function deleteMedication(id: string): boolean {
  const med = dataStore.get().meds[id]
  const allowed = med && (med.kind === 'ROUTINE' || med.ownerId === viewer())
  if (!med || !allowed) return false
  const undo = transact((tx) => {
    tx.remove('meds', id)
    for (const t of Object.values(tx.state().tasks)) {
      if (t.sourceMedicationId === id && t.status === 'PENDING') tx.remove('tasks', t.id)
    }
  })
  ui.toast(`${med.kind === 'ROUTINE' ? 'Rotina excluída' : 'Remédio excluído'} · ${med.name}`, { undo, tone: 'info' })
  return true
}

export function deleteEvent(id: string): boolean {
  const ev = editableEvent(id)
  if (!ev) return false
  const undo = transact((tx) => tx.remove('events', id))
  ui.toast(`Compromisso excluído · ${ev.title}`, { undo, tone: 'info' })
  return true
}

/* ---------- Apoio do par ---------- */

export function requestHelp(input: { targetTaskId: string | null; situation: string; helpType: HelpType; urgency: Urgency }) {
  const who = viewer()
  const req: HelpRequest = {
    id: uuid(),
    requesterId: who,
    targetTaskId: input.targetTaskId,
    situation: input.situation,
    helpType: input.helpType,
    urgency: input.urgency,
    status: 'OPEN',
    response: null,
    respondedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  const undo = transact((tx) => tx.put('helpRequests', req))
  ui.toast(`Pedido enviado para ${nameOf(otherPartner(who))}`, { undo })
}

export function respondHelp(id: string, response: HelpResponse) {
  const who = viewer()
  const req = dataStore.get().helpRequests[id]
  if (!req) return
  const undo = transact((tx) => {
    tx.put('helpRequests', { ...req, status: 'ACCEPTED', response, respondedAt: nowIso(), updatedAt: nowIso() })
    if (response === 'TAKE_OVER' && req.targetTaskId) {
      const task = tx.get('tasks', req.targetTaskId)
      if (task) tx.put('tasks', { ...task, assignedTo: who, sentBy: req.requesterId, visibleToPartner: true, updatedAt: nowIso() })
    }
  })
  ui.toast(response === 'TAKE_OVER' ? `Você assumiu: ${req.situation}` : `Combinado: vocês fazem juntos`, { undo })
}

export function resolveHelp(id: string) {
  const req = dataStore.get().helpRequests[id]
  if (!req) return
  transact((tx) => tx.put('helpRequests', { ...req, status: 'RESOLVED', updatedAt: nowIso() }))
}

export function sendNudge(medicationLogId: string, medName: string) {
  const who = viewer()
  const to = otherPartner(who)
  const undo = transact((tx) =>
    tx.put('nudges', {
      id: uuid(),
      from: who,
      to,
      medicationLogId,
      message: `Pega uma água e toma o ${medName}? Tô contigo.`,
      createdAt: nowIso(),
      seenAt: null,
      updatedAt: nowIso(),
    }),
  )
  ui.toast(`Lembrete carinhoso enviado para ${nameOf(to)}`, { undo })
}

export function seeNudge(id: string) {
  const n = dataStore.get().nudges[id]
  if (!n) return
  transact((tx) => tx.put('nudges', { ...n, seenAt: nowIso(), updatedAt: nowIso() }))
}
