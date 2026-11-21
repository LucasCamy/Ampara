import { useEffect } from 'react'
import { authStore } from '../../auth/session'
import { ALERT_CATEGORIES, CATEGORY, billsDueOn, clockAlerts, decide, incomingAlerts, type AlertCategory, type AlertSound } from '../../domain/alerts'
import { toDateKey } from '../../domain/dates'
import { ritualLocalScope, RITUAL_WINDOWS, type RitualWindow } from '../../domain/rituals'
import { firstName } from '../../domain/format'
import { otherPartner, type DataState, type PartnerId } from '../../domain/types'
import { alertPrefsStore, clearAlerts, dismissWhere, markSeen, raiseAlert, wasSeen, type ShownAlert } from '../../store/alerts'
import { minuteClock } from '../../store/clock'
import { dataStore } from '../../store/data'
import { isRitualDone, isRitualPresented } from '../../store/rituals'
import { uiStore } from '../../store/ui'
import { installAudioUnlock, playSound, vibrate } from './sound'

/**
 * Liga os avisos à vida real do app aberto:
 *  - relógio (a cada tique do minuteClock): dose na hora, fim do "pegando água", atraso do par, conta do dia;
 *  - sincronização (cada mudança no dataStore): pedido de ajuda, lembrete carinhoso, foco, tarefa, check-in;
 *  - push recebido com o app visível (mensagem do service worker): toca o som da categoria aqui.
 * Ao abrir, o que já está valendo é marcado como visto sem tocar: o Hoje já mostra.
 */

const partnerName = (s: DataState, viewer: PartnerId) => firstName(s.profiles[otherPartner(viewer)]?.displayName ?? '') || 'Seu par'

/** O aviso ainda faz sentido? (resolvido em outro lugar: some sozinho) */
function stale(a: ShownAlert, s: DataState, viewer: PartnerId): boolean {
  if (!a.ref || a.key.startsWith('preview:')) return false
  if (a.key.startsWith('due:') || a.key.startsWith('snooze:') || a.key.startsWith('late:') || a.key.startsWith('self-late:')) {
    const st = s.medLogs[a.ref]?.status
    if (st === 'TAKEN' || st === 'SKIPPED') return true
    return (a.key.startsWith('due:') || a.key.startsWith('self-late:')) && st === 'SNOOZED_WATER'
  }
  if (a.key.startsWith('bills:') || a.key.startsWith('bills-ahead:')) return billsDueOn(s, viewer, a.ref).length === 0
  if (a.key.startsWith('event:')) {
    const event = s.events[a.ref]
    return !event || !a.key.includes(`@${event.date}T${event.start}#`)
  }
  if (a.key.startsWith('help:')) return s.helpRequests[a.ref]?.status !== 'OPEN'
  if (a.key.startsWith('nudge:')) return !!s.nudges[a.ref]?.seenAt
  if (a.key.startsWith('focus:')) {
    const f = s.focusSessions[a.ref]
    return !f || f.status !== 'RUNNING' || !!f.joinedBy
  }
  return false
}

export function useAlertWatch() {
  useEffect(() => {
    installAudioUnlock()
    let viewer = uiStore.get().viewer
    let prev = dataStore.get()
    let stopped = false
    const seed = () => markSeen(clockAlerts(dataStore.get(), viewer, new Date(), partnerName(dataStore.get(), viewer), alertPrefsStore.get().rituals).map((c) => c.key))
    seed()

    const notifyClock = async (now: Date) => {
      const who = viewer
      const state = dataStore.get()
      for (const candidate of clockAlerts(state, who, now, partnerName(state, who), alertPrefsStore.get().rituals)) {
        if (candidate.category === 'ritual' && RITUAL_WINDOWS.includes(candidate.ref as RitualWindow)) {
          try {
            const args = [ritualLocalScope(state), who, toDateKey(now), candidate.ref as RitualWindow] as const
            if (await isRitualDone(...args) || await isRitualPresented(...args)) continue
          } catch {
            // Sem marcador legível, evita repetir um convite que pode já ter aparecido.
            continue
          }
        }
        if (stopped || viewer !== who || authStore.get().status !== 'unlocked') return
        raiseAlert(candidate, now)
      }
    }

    const offData = dataStore.subscribe(() => {
      const next = dataStore.get()
      if (next === prev) return
      const now = new Date()
      for (const c of incomingAlerts(prev, next, viewer, now, partnerName(next, viewer))) raiseAlert(c, now)
      dismissWhere((a) => stale(a, next, viewer))
      prev = next
    })
    const offClock = minuteClock.subscribe(() => {
      const now = new Date(minuteClock.get())
      void notifyClock(now)
    })
    // trocar de pessoa no mesmo aparelho: avisos da outra pessoa somem e o que já vale não toca
    const offUi = uiStore.subscribe(() => {
      const v = uiStore.get().viewer
      if (v === viewer) return
      viewer = v
      prev = dataStore.get()
      clearAlerts()
      seed()
    })
    return () => {
      stopped = true
      offData()
      offClock()
      offUi()
      clearAlerts()
    }
  }, [])
}

export interface PushAlertMessage {
  type: 'ALERT'
  key?: unknown
  category?: unknown
  sound?: unknown
  title?: unknown
  body?: unknown
  label?: unknown
}

const SOUNDS: AlertSound[] = [...ALERT_CATEGORIES, 'water']

/**
 * Push que chegou com o app na frente: o service worker mostra a notificação calada e manda para cá.
 * Logado, vira aviso (se o relógio do app já não avisou o mesmo); na tela de login, só o som da categoria.
 */
export function handlePushMessage(m: PushAlertMessage) {
  const category = (ALERT_CATEGORIES as unknown[]).includes(m.category) ? (m.category as AlertCategory) : 'home'
  const sound = (SOUNDS as unknown[]).includes(m.sound) ? (m.sound as AlertSound) : category
  const key = typeof m.key === 'string' && m.key ? m.key : `push:${Date.now()}`
  if (authStore.get().status !== 'unlocked') {
    const prefs = alertPrefsStore.get()
    const now = new Date()
    if (decide(prefs, category, now.getHours() * 60 + now.getMinutes()).loud) {
      if (prefs.sound) playSound(sound, prefs.volume)
      if (prefs.vibrate) vibrate(sound)
    }
    return
  }
  if (wasSeen(key)) return
  const bill = key.startsWith('bills:') || key.startsWith('bills-ahead:')
  const ref = key.startsWith('self-late:') ? key.slice('self-late:'.length) : bill ? key.split(':').at(-1) : undefined
  raiseAlert({
    key,
    category,
    sound,
    label: typeof m.label === 'string' && m.label ? m.label : CATEGORY[category].label,
    title: typeof m.title === 'string' ? m.title : 'Ampara',
    body: typeof m.body === 'string' ? m.body : '',
    actions: key.startsWith('self-late:') ? ['take', 'water'] : bill ? ['open-finance'] : ['help', 'support', 'event', 'ritual'].includes(category) ? ['open-today'] : [],
    ref,
  })
}
