import { atTime, minutesOf, toDateKey } from './dates'
import { MOOD_LABEL } from './mood'
import { doseView, minutesLate } from './medication'
import { dosesFor, partnerDelayAlerts } from './today'
import { canReceiveBillReminder, visibleTransactions } from './privacy'
import { canViewFocusSession } from './together'
import { normalizeRitualSchedules, defaultRitualSchedules, ritualAlertKey, RITUAL_LABELS, RITUAL_WINDOWS, type RitualSchedules } from './rituals'
import type { DataState, PartnerId, TimeKey } from './types'

/**
 * Avisos do Ampara (dentro do app e na tela bloqueada). Puro: sem navegador, sem React.
 * Cada aviso pertence a uma categoria real do casal; a categoria decide cor, ícone, som, vibração e se
 * fica na tela até a pessoa responder. O servidor de lembretes (server/push/plan.ts) usa as mesmas regras.
 */

export type AlertCategory = 'med' | 'help' | 'support' | 'partner' | 'home' | 'event' | 'ritual'
/** "water" é o "pegou a água?" do remédio: mesma categoria, som próprio (curto) */
export type AlertSound = AlertCategory | 'water'

export const ALERT_CATEGORIES: AlertCategory[] = ['med', 'help', 'support', 'partner', 'home', 'event', 'ritual']

export interface CategoryMeta {
  label: string
  /** o que entra nesta categoria (Ajustes) */
  description: string
  /** fica na tela até responder (no app e, onde o aparelho deixa, na tela bloqueada) */
  sticky: boolean
  /** padrão de vibração em ms (Android; o iPhone ignora) */
  vibrate: number[]
}

export const CATEGORY: Record<AlertCategory, CategoryMeta> = {
  med: { label: 'Remédio', description: 'Hora da dose e o “pegou a água?” depois de 5 min.', sticky: true, vibrate: [200, 100, 200] },
  help: { label: 'Pedido de ajuda', description: 'Quando seu par pede ajuda. O aviso mais insistente.', sticky: true, vibrate: [400, 150, 400, 150, 400] },
  support: { label: 'Rede de apoio', description: 'Quando o remédio do seu par passa do limite.', sticky: false, vibrate: [150] },
  partner: { label: 'Do seu par', description: 'Lembrete carinhoso, foco junto, tarefa enviada e check-in.', sticky: false, vibrate: [60, 60, 60] },
  home: { label: 'Casa e contas', description: 'Rotinas na hora e suas contas que estão para vencer.', sticky: false, vibrate: [] },
  event: { label: 'Compromissos', description: 'Margem para se preparar: avisos 30 e 10 min antes.', sticky: false, vibrate: [100, 70, 100] },
  ritual: { label: 'Check-ins do dia', description: 'Manhã, tarde opcional e fechamento leve nos seus horários.', sticky: false, vibrate: [80] },
}

export const SOUND_VIBRATE: Record<AlertSound, number[]> = {
  ...Object.fromEntries(ALERT_CATEGORIES.map((c) => [c, CATEGORY[c].vibrate])),
  water: [120],
} as Record<AlertSound, number[]>

/* ---------- preferências (por aparelho) ---------- */

export type AlertVolume = 'LOW' | 'MEDIUM' | 'HIGH'

export interface QuietHours {
  on: boolean
  start: TimeKey
  end: TimeKey
  /** pedido de ajuda toca mesmo no silêncio */
  helpBreaks: boolean
}

export interface AlertPrefs {
  enabled: Record<AlertCategory, boolean>
  sound: boolean
  volume: AlertVolume
  vibrate: boolean
  quiet: QuietHours
  rituals: RitualSchedules
}

export const DEFAULT_PREFS: AlertPrefs = {
  enabled: { med: true, help: true, support: true, partner: true, home: true, event: true, ritual: true },
  sound: true,
  volume: 'MEDIUM',
  vibrate: true,
  quiet: { on: false, start: '22:00', end: '07:00', helpBreaks: true },
  rituals: defaultRitualSchedules(),
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Lê preferências gravadas (de versões antigas ou corrompidas) sem quebrar: o que não serve volta ao padrão */
export function normalizePrefs(raw: unknown): AlertPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof AlertPrefs, unknown>>
  const en = (r.enabled && typeof r.enabled === 'object' ? r.enabled : {}) as Record<string, unknown>
  const q = (r.quiet && typeof r.quiet === 'object' ? r.quiet : {}) as Record<string, unknown>
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  const time = (v: unknown, d: TimeKey) => (typeof v === 'string' && TIME.test(v) ? v : d)
  return {
    enabled: Object.fromEntries(ALERT_CATEGORIES.map((c) => [c, bool(en[c], true)])) as Record<AlertCategory, boolean>,
    sound: bool(r.sound, DEFAULT_PREFS.sound),
    volume: r.volume === 'LOW' || r.volume === 'HIGH' || r.volume === 'MEDIUM' ? r.volume : DEFAULT_PREFS.volume,
    vibrate: bool(r.vibrate, DEFAULT_PREFS.vibrate),
    quiet: {
      on: bool(q.on, false),
      start: time(q.start, DEFAULT_PREFS.quiet.start),
      end: time(q.end, DEFAULT_PREFS.quiet.end),
      helpBreaks: bool(q.helpBreaks, true),
    },
    rituals: normalizeRitualSchedules(r.rituals),
  }
}

/** Dentro do horário de silêncio? Aceita janela que passa da meia-noite (22:00 às 07:00). Início == fim: desligado. */
export function inQuietHours(quiet: Pick<QuietHours, 'on' | 'start' | 'end'>, minutesNow: number): boolean {
  if (!quiet.on) return false
  const s = minutesOf(quiet.start)
  const e = minutesOf(quiet.end)
  if (s === e) return false
  return s < e ? minutesNow >= s && minutesNow < e : minutesNow >= s || minutesNow < e
}

export interface AlertDecision {
  /** mostra o aviso */
  show: boolean
  /** toca som e vibra */
  loud: boolean
}

/** Categoria desligada some; no silêncio o aviso aparece calado (o pedido de ajuda pode furar) */
export function decide(prefs: AlertPrefs, category: AlertCategory, minutesNow: number): AlertDecision {
  if (!prefs.enabled[category]) return { show: false, loud: false }
  const quiet = inQuietHours(prefs.quiet, minutesNow) && !(category === 'help' && prefs.quiet.helpBreaks)
  return { show: true, loud: !quiet }
}

/**
 * Versão enxuta que vai para o servidor junto com a inscrição de push: só o que ele precisa para decidir
 * (categorias desligadas e silêncio). Som e volume são do aparelho.
 */
export interface ServerPrefs {
  off: AlertCategory[]
  quiet: { start: TimeKey; end: TimeKey; helpBreaks: boolean } | null
  rituals?: RitualSchedules
}

export function toServerPrefs(p: AlertPrefs): ServerPrefs {
  return {
    off: ALERT_CATEGORIES.filter((c) => !p.enabled[c]),
    quiet: p.quiet.on ? { start: p.quiet.start, end: p.quiet.end, helpBreaks: p.quiet.helpBreaks } : null,
    rituals: p.rituals,
  }
}

export function fromServerPrefs(raw: unknown): ServerPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const off = Array.isArray(r.off) ? (r.off.filter((c) => (ALERT_CATEGORIES as unknown[]).includes(c)) as AlertCategory[]) : []
  const q = r.quiet && typeof r.quiet === 'object' ? (r.quiet as Record<string, unknown>) : null
  const quiet =
    q && typeof q.start === 'string' && TIME.test(q.start) && typeof q.end === 'string' && TIME.test(q.end)
      ? { start: q.start, end: q.end, helpBreaks: q.helpBreaks !== false }
      : null
  return { off, quiet, rituals: normalizeRitualSchedules(r.rituals) }
}

/** Mesmo "decide", do lado do servidor (sem som: lá só importa mandar ou não) */
export function serverAllows(p: ServerPrefs, category: AlertCategory, minutesNow: number): boolean {
  if (p.off.includes(category)) return false
  if (!p.quiet) return true
  if (category === 'help' && p.quiet.helpBreaks) return true
  return !inQuietHours({ on: true, ...p.quiet }, minutesNow)
}

/* ---------- o que avisar ---------- */

export type AlertActionId = 'take' | 'water' | 'help-take' | 'help-together' | 'nudge-seen' | 'focus-join' | 'open-today' | 'open-finance'

export interface AlertCandidate {
  /** chave estável: o mesmo aviso nunca aparece duas vezes (igual à do servidor, sem o aparelho) */
  key: string
  category: AlertCategory
  sound: AlertSound
  /** "Remédio · 08:00" */
  label: string
  title: string
  body: string
  actions: AlertActionId[]
  /** id do registro que a ação usa (dose, pedido, lembrete, sessão) */
  ref?: string
}

/** Quanto tempo depois do horário o app ainda avisa (cobre o celular parado alguns minutos) */
export const CLOCK_WINDOW_MIN = 10
/** Até quanto tempo depois de criado um evento do par ainda vira aviso (pull atrasado, app reaberto) */
export const INCOMING_WINDOW_MIN = 15

const age = (iso: string, now: Date) => (now.getTime() - new Date(iso).getTime()) / 60_000
const recent = (iso: string, now: Date) => {
  const a = age(iso, now)
  return a >= -2 && a <= INCOMING_WINDOW_MIN
}

/**
 * Avisos que dependem do relógio: dose na hora, fim do "pegando água", remédio do par atrasado e
 * contas do casal que vencem hoje. Devolve tudo o que está "na janela" agora; quem chama guarda as chaves
 * já avisadas.
 */
export function billsDueOn(state: DataState, viewer: PartnerId, date: string) {
  return visibleTransactions(Object.values(state.transactions), viewer, state.profiles as Parameters<typeof visibleTransactions>[2])
    .filter((t) => canReceiveBillReminder(t, viewer) && t.status === 'PREDICTED_DASHED' && t.type === 'EXPENSE' && t.competenceDate === date)
}

export function clockAlerts(state: DataState, viewer: PartnerId, now: Date, partnerName: string, rituals?: RitualSchedules): AlertCandidate[] {
  const out: AlertCandidate[] = []
  const today = toDateKey(now)

  for (const d of dosesFor(state, viewer, today, now)) {
    const { med, log } = d
    if (log.status === 'TAKEN' || log.status === 'SKIPPED') continue
    const routine = med.kind === 'ROUTINE' || med.ownerId === null
    const late = minutesLate(log, now)
    const scheduledPassed = now.getTime() >= atTime(log.scheduledDate, log.scheduledTime).getTime()
    const activeSnooze = log.status === 'SNOOZED_WATER' && !!log.snoozeUntil && new Date(log.snoozeUntil) > now
    const selfLate = state.couple.couple?.mode === 'SOLO' && !routine && med.ownerId === viewer && !activeSnooze && late >= med.delayMinutesThreshold && late <= med.delayMinutesThreshold + 60
    if (selfLate) {
      out.push({ key: `self-late:${log.id}`, category: 'med', sound: 'med', label: `Remédio · ${log.scheduledTime}`, title: 'Um passo de cada vez', body: `${med.name} ainda está sem confirmação. Se já tomou, registre quando puder.`, actions: ['take', 'water'], ref: log.id })
      continue
    }
    if (log.status === 'SNOOZED_WATER' && log.snoozeUntil) {
      const over = age(log.snoozeUntil, now)
      if (!routine && over >= 0 && over <= CLOCK_WINDOW_MIN) {
        out.push({
          key: `snooze:${log.id}#${log.snoozeCount}`,
          category: 'med',
          sound: 'water',
          label: `Remédio · ${log.scheduledTime}`,
          title: 'Pegou a água?',
          body: `Hora de confirmar ${med.name}.`,
          actions: ['take'],
          ref: log.id,
        })
      }
      continue
    }
    if (log.snoozeCount || !scheduledPassed || late > CLOCK_WINDOW_MIN) continue
    out.push(
      routine
        ? {
            key: `due:${log.id}`,
            category: 'home',
            sound: 'home',
            label: `Rotina · ${log.scheduledTime}`,
            title: med.name,
            body: med.dosage ? `${med.dosage}. Marque quando terminar.` : 'Marque quando terminar.',
            actions: ['take'],
            ref: log.id,
          }
        : {
            key: `due:${log.id}`,
            category: 'med',
            sound: 'med',
            label: `Remédio · ${log.scheduledTime}`,
            title: `Hora do remédio: ${med.name}`,
            body: `${med.dosage}. Já engoliu ou vai pegar água?`,
            actions: ['take', 'water'],
            ref: log.id,
          },
    )
  }

  for (const a of state.couple.couple?.mode === 'SOLO' ? [] : partnerDelayAlerts(state, viewer, now)) {
    if (doseView(a.log, now) === 'SNOOZED_WATER') continue
    const late = minutesLate(a.log, now)
    if (late > a.med.delayMinutesThreshold + 60) continue
    out.push({
      key: `late:${a.log.id}`,
      category: 'support',
      sound: 'support',
      label: `Rede de apoio · ${late} min de atraso`,
      title: `Remédio de ${partnerName} pendente`,
      body: `O das ${a.log.scheduledTime} (${a.med.name}) ainda não foi confirmado. Um lembrete gentil ajuda.`,
      actions: ['open-today'],
      ref: a.log.id,
    })
  }

  const bills = billsDueOn(state, viewer, today)
  if (bills.length && now.getHours() >= 8) {
    out.push({
      key: `bills:${viewer}:${today}`,
      category: 'home',
      sound: 'home',
      label: 'Contas · vence hoje',
      title: bills.length === 1 ? `${bills[0]!.description} vence hoje` : `${bills.length} contas suas vencem hoje`,
      body: 'Dê baixa quando pagar.',
      actions: ['open-finance'],
      ref: today,
    })
  }
  for (const event of Object.values(state.events)) {
    if (event.ownerId !== null && event.ownerId !== viewer) continue
    const until = (atTime(event.date, event.start).getTime() - now.getTime()) / 60_000
    for (const lead of [30, 10]) {
      const elapsed = lead - until
      if (elapsed < 0 || elapsed >= CLOCK_WINDOW_MIN || until <= 0) continue
      out.push({ key: `event:${event.id}@${event.date}T${event.start}#${lead}`, category: 'event', sound: 'event', label: `Compromisso · ${event.start}`, title: event.title, body: lead === 30 ? 'Seu compromisso está chegando. Separe um pouco de tempo para a transição.' : 'Faltam poucos minutos. Você pode começar a se preparar para sair.', actions: ['open-today'], ref: event.id })
    }
  }
  if (rituals) {
    const minutes = now.getHours() * 60 + now.getMinutes()
    for (const window of RITUAL_WINDOWS) {
      const schedule = rituals[window]
      const elapsed = minutes - minutesOf(schedule.time)
      if (!schedule.enabled || elapsed < 0 || elapsed >= CLOCK_WINDOW_MIN) continue
      out.push({ key: ritualAlertKey(state.couple.couple?.spaceId, viewer, today, window), category: 'ritual', sound: 'ritual', label: `Check-in · ${schedule.time}`, title: RITUAL_LABELS[window], body: 'Um momento curto para perceber seu ritmo, sem cobrança.', actions: ['open-today'], ref: window })
    }
  }
  return out
}

/**
 * Avisos que chegam do par pela sincronização: compara o estado anterior com o novo e devolve só o que é
 * novo, do par e recente (um pull de coisas antigas não vira enxurrada de avisos).
 */
export function incomingAlerts(prev: DataState, next: DataState, viewer: PartnerId, now: Date, partnerName: string): AlertCandidate[] {
  const out: AlertCandidate[] = []
  if (next.couple.couple?.mode === 'SOLO') return out

  for (const h of Object.values(next.helpRequests)) {
    const before = prev.helpRequests[h.id]
    if (h.requesterId !== viewer && h.status === 'OPEN' && !before && recent(h.createdAt, now)) {
      out.push({
        key: `help:${h.id}`,
        category: 'help',
        sound: 'help',
        label: h.urgency === 'NOW' ? 'Pedido de ajuda · agora' : h.urgency === 'TODAY' ? 'Pedido de ajuda · ainda hoje' : 'Pedido de ajuda · esta semana',
        title: `${partnerName} pediu ajuda`,
        body: h.situation,
        actions: ['help-take', 'help-together'],
        ref: h.id,
      })
    }
    // a resposta ao meu pedido
    if (h.requesterId === viewer && h.status === 'ACCEPTED' && before?.status === 'OPEN' && h.respondedAt && recent(h.respondedAt, now)) {
      out.push({
        key: `help-answer:${h.id}`,
        category: 'partner',
        sound: 'partner',
        label: 'Pedido de ajuda · respondido',
        title: h.response === 'TAKE_OVER' ? `${partnerName} assumiu` : `${partnerName} vai fazer junto`,
        body: h.situation,
        actions: [],
        ref: h.id,
      })
    }
  }

  for (const n of Object.values(next.nudges)) {
    if (n.to !== viewer || n.seenAt || prev.nudges[n.id] || !recent(n.createdAt, now)) continue
    out.push({ key: `nudge:${n.id}`, category: 'partner', sound: 'partner', label: 'Lembrete carinhoso', title: `${partnerName} lembrou de você`, body: n.message, actions: ['nudge-seen'], ref: n.id })
  }

  for (const f of Object.values(next.focusSessions)) {
    if (f.startedBy === viewer || f.status !== 'RUNNING' || f.joinedBy || prev.focusSessions[f.id] || !recent(f.startedAt, now) || !canViewFocusSession(f, viewer, next.tasks)) continue
    out.push({
      key: `focus:${f.id}`,
      category: 'partner',
      sound: 'partner',
      label: `Foco junto · ${f.durationMin} min`,
      title: `${partnerName} chamou você para focar junto`,
      body: f.title,
      actions: ['focus-join'],
      ref: f.id,
    })
  }

  for (const t of Object.values(next.tasks)) {
    if (t.assignedTo !== viewer || t.sentBy === viewer || !t.sentBy || t.status !== 'PENDING') continue
    const before = prev.tasks[t.id]
    if (before && before.assignedTo === viewer) continue
    if (!recent(t.updatedAt, now)) continue
    out.push({ key: `task:${t.id}@${t.updatedAt}`, category: 'partner', sound: 'partner', label: 'Tarefa enviada para você', title: t.title, body: `${partnerName} passou para você.`, actions: ['open-today'], ref: t.id })
  }

  for (const m of Object.values(next.moodCheckins)) {
    if (m.ownerId === viewer || m.date !== toDateKey(now) || !recent(m.updatedAt, now)) continue
    const before = prev.moodCheckins[m.id]
    if (before && before.mood === m.mood && before.note === m.note) continue
    const noteOnly = before && before.mood === m.mood
    out.push({
      key: `mood:${m.id}@${m.updatedAt}`,
      category: 'partner',
      sound: 'partner',
      label: noteOnly ? 'Recado do seu par' : 'Check-in do seu par',
      title: noteOnly ? `${partnerName} deixou um recado` : `${partnerName} fez o check-in`,
      body: m.note || `Hoje: ${MOOD_LABEL[m.mood].toLowerCase()}.`,
      actions: ['open-today'],
      ref: m.id,
    })
  }
  return out
}
