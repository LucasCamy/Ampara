import { addDays, atTime, parseDateKey, toDateKey } from './dates'
import { canViewRule, seededUuid } from './ledger'
import { visibleTransactions } from './privacy'
import { canViewTask } from './tasks'
import type { CalendarEvent, DataState, DateKey, PartnerId, SplitRule, Task, Transaction, TxCategory, TxScope } from './types'

export const SUGGESTION_COOLDOWN_MS = 7 * 24 * 60 * 60_000
const STARTUP_DAYS = 7
export type DiscoveryTip = 'reading' | 'voice' | 'routines'

export type Suggestion =
  | { id: string; kind: 'postponed-task'; payload: { taskId: string; title: string } }
  | { id: string; kind: 'recurring-expense'; payload: { transactionId: string; description: string; amountCents: number; category: TxCategory; scope: TxScope; paidBy: PartnerId; splitRule: SplitRule | null; date: DateKey } }
  | { id: string; kind: 'event-preparation'; payload: { eventId: string; eventTitle: string; prepTitle: string; dueDate: DateKey } }
  | { id: string; kind: 'comfort-kit'; payload: { ownerId: PartnerId } }
  | { id: string; kind: 'discovery'; payload: { tip: DiscoveryTip } }

export interface SuggestionContext {
  /** Apenas ids técnicos e epoch em milissegundos. O conteúdo da sugestão não vai para metadados. */
  dismissals?: Readonly<Record<string, number>>
  readingFont?: 'jakarta' | 'lexend' | 'atkinson'
  voiceUsed?: boolean
  discoveryDisabled?: boolean
}

const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const expenseKey = (tx: Pick<Transaction, 'scope' | 'category' | 'description'>) => `${tx.scope}:${tx.category}:${normalized(tx.description)}`
const idCompare = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)

function available(id: string, nowMs: number, context: SuggestionContext): boolean {
  const dismissed = context.dismissals?.[id]
  return typeof dismissed !== 'number' || !Number.isFinite(dismissed) || nowMs - dismissed >= SUGGESTION_COOLDOWN_MS
}

function taskCandidates(state: DataState, viewer: PartnerId): Suggestion[] {
  return Object.values(state.tasks)
    .filter((task) => task.status === 'PENDING' && (task.postponeCount ?? 0) >= 3 && (task.assignedTo === viewer || task.assignedTo === null) && canViewTask(task, viewer))
    .sort((a, b) => (b.postponeCount ?? 0) - (a.postponeCount ?? 0) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.createdAt.localeCompare(b.createdAt) || idCompare(a, b))
    .map((task) => ({ id: `postponed-task:${task.id}`, kind: 'postponed-task', payload: { taskId: task.id, title: task.title } }))
}

function recurrenceCandidates(state: DataState, viewer: PartnerId, today: DateKey): Suggestion[] {
  const profiles = { A: state.profiles.A ?? { sharePersonalFinances: false }, B: state.profiles.B ?? { sharePersonalFinances: false } }
  const solo = state.couple.couple?.mode === 'SOLO'
  const transactions = visibleTransactions(Object.values(state.transactions), viewer, profiles).filter((tx) =>
    tx.type === 'EXPENSE' && tx.status === 'CONFIRMED_SOLID' && !tx.recurrenceId && !tx.installmentGroup && !tx.isSecretGift &&
    (tx.installmentTotal ?? 1) <= 1 && tx.competenceDate <= today && normalized(tx.description) && tx.amountCents > 0 &&
    (tx.scope === 'COUPLE' ? !solo : tx.createdBy === viewer),
  )
  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const key = expenseKey(tx)
    const group = groups.get(key) ?? []
    group.push(tx)
    groups.set(key, group)
  }
  const currentMonth = today.slice(0, 7)
  const activeRules = Object.values(state.recurrences).filter((rule) => canViewRule(rule, viewer) && (!rule.endMonth || rule.endMonth >= currentMonth))
  const repeated: Transaction[] = []
  for (const [key, group] of groups) {
    if (new Set(group.map((tx) => tx.competenceDate.slice(0, 7))).size < 2) continue
    if (activeRules.some((rule) => expenseKey(rule) === key)) continue
    const latest = [...group].sort((a, b) => b.competenceDate.localeCompare(a.competenceDate) || b.updatedAt.localeCompare(a.updatedAt) || idCompare(a, b))[0]!
    repeated.push(latest)
  }
  return repeated.sort((a, b) => b.competenceDate.localeCompare(a.competenceDate) || idCompare(a, b)).map((tx) => ({
    id: `recurring-expense:${seededUuid(expenseKey(tx))}`,
    kind: 'recurring-expense',
    payload: { transactionId: tx.id, description: tx.description, amountCents: tx.amountCents, category: tx.category, scope: tx.scope, paidBy: tx.paidBy, splitRule: tx.splitRule, date: tx.competenceDate },
  }))
}

const PREPARABLE = /\b(?:medico|consulta|exame|dentista|viagem|voo|entrevista|cartorio)\b/
const PREPARING = /\b(?:preparar|separar|organizar|conferir|levar|documentos|mala|arrumar)\b/

function hasPreparation(tasks: Task[], event: CalendarEvent, prepTitle: string): boolean {
  const eventText = normalized(event.title)
  const eventWords = eventText.split(' ').filter((word) => word.length > 2 && !/^(?:para|com|uma|dos|das|medico|consulta|exame|dentista|viagem|voo|entrevista|cartorio)$/.test(word))
  const from = addDays(event.date, -3)
  return tasks.some((task) => {
    const text = normalized(task.title)
    const related = text === normalized(prepTitle) || (PREPARING.test(text) && (text.includes(eventText) || (eventWords.length > 0 && eventWords.every((word) => text.split(' ').includes(word)))))
    if (!related) return false
    if (task.status === 'PENDING' && task.dueDate === null) return true
    const completedDate = task.completedAt ? toDateKey(new Date(task.completedAt)) : null
    return [task.dueDate, completedDate].some((date) => date !== null && date >= from && date <= event.date)
  })
}

function eventCandidates(state: DataState, viewer: PartnerId, now: Date): Suggestion[] {
  const today = toDateKey(now)
  const last = addDays(today, 3)
  const tasks = Object.values(state.tasks).filter((task) => canViewTask(task, viewer) && (task.assignedTo === viewer || task.assignedTo === null))
  return Object.values(state.events)
    .filter((event) => (event.ownerId === viewer || event.ownerId === null) && event.date >= today && event.date <= last && atTime(event.date, event.start).getTime() >= now.getTime() && PREPARABLE.test(normalized(event.title)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || idCompare(a, b))
    .flatMap((event): Suggestion[] => {
      const prepTitle = `Preparar para ${event.title.trim()}`.slice(0, 120)
      if (hasPreparation(tasks, event, prepTitle)) return []
      return [{ id: `event-preparation:${event.id}`, kind: 'event-preparation', payload: { eventId: event.id, eventTitle: event.title, prepTitle, dueDate: event.date === today ? today : addDays(event.date, -1) } }]
    })
}

function comfortCandidate(state: DataState, viewer: PartnerId, today: DateKey): Suggestion[] {
  if (Object.values(state.comfortItems).some((item) => item.ownerId === viewer && item.text.trim())) return []
  const from = addDays(today, -6)
  const dates = new Set(Object.values(state.moodCheckins).filter((checkin) => checkin.ownerId === viewer && checkin.date >= from && checkin.date <= today && (checkin.mood === 'OVERWHELMED' || checkin.mood === 'LOW_ENERGY')).map((checkin) => checkin.date))
  return dates.size >= 2 ? [{ id: `comfort-kit:${viewer}`, kind: 'comfort-kit', payload: { ownerId: viewer } }] : []
}

function discoveryCandidates(state: DataState, now: Date, context: SuggestionContext): Suggestion[] {
  if (context.discoveryDisabled) return []
  const created = new Date(state.couple.couple?.pairedAt ?? '')
  if (Number.isNaN(created.getTime())) return []
  const ageDays = Math.round((parseDateKey(toDateKey(now)).getTime() - parseDateKey(toDateKey(created)).getTime()) / 86_400_000)
  if (ageDays < 0 || ageDays >= STARTUP_DAYS) return []
  const tips: DiscoveryTip[] = []
  if (!context.readingFont || context.readingFont === 'jakarta') tips.push('reading')
  if (!context.voiceUsed) tips.push('voice')
  if (!Object.values(state.meds).some((med) => med.kind === 'ROUTINE')) tips.push('routines')
  return tips.map((tip) => ({ id: `discovery:${tip}`, kind: 'discovery', payload: { tip } }))
}

/** No máximo uma sugestão local, na ordem do produto. A bateria em sobrecarga sempre tem silêncio. */
export function pickTopSuggestion(state: DataState, viewer: PartnerId, now: Date, context: SuggestionContext = {}): Suggestion | null {
  const me = state.profiles[viewer]
  if (!me || me.energy === 'OVERLOAD') return null
  const today = toDateKey(now)
  const candidates = [
    () => taskCandidates(state, viewer),
    () => recurrenceCandidates(state, viewer, today),
    () => eventCandidates(state, viewer, now),
    () => comfortCandidate(state, viewer, today),
    () => discoveryCandidates(state, now, context),
  ]
  for (const pick of candidates) {
    const suggestion = pick().find((candidate) => available(candidate.id, now.getTime(), context))
    if (suggestion) return suggestion
  }
  return null
}
