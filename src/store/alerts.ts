import { CATEGORY, decide, normalizePrefs, type AlertCandidate, type AlertCategory, type AlertPrefs, type AlertSound } from '../domain/alerts'
import { playSound, vibrate } from '../features/alerts/sound'
import { createStore, useStore } from './createStore'

/**
 * Avisos dentro do app (separados dos toasts, que só confirmam o que a própria pessoa fez).
 * Um aviso nunca aparece duas vezes: as chaves já vistas ficam em memória durante a sessão. Ao abrir o app,
 * o que já está na tela do Hoje é marcado como visto sem tocar (ver useAlertWatch).
 * As preferências são do aparelho (som, volume, silêncio), não dados do casal.
 */

export interface ShownAlert extends AlertCandidate {
  id: number
  /** tocou som/vibrou (fora do silêncio) */
  loud: boolean
}

const PREFS_KEY = 'ampara:alerts'
const MAX = 3
const AUTO_DISMISS_MS = 8000

function loadPrefs(): AlertPrefs {
  try {
    return normalizePrefs(JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null'))
  } catch {
    return normalizePrefs(null)
  }
}

export const alertPrefsStore = createStore<AlertPrefs>(loadPrefs())
export const useAlertPrefs = <S>(sel: (p: AlertPrefs) => S) => useStore(alertPrefsStore, sel)

export function setAlertPrefs(updater: (p: AlertPrefs) => AlertPrefs) {
  alertPrefsStore.set((p) => normalizePrefs(updater(p)))
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(alertPrefsStore.get()))
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

export const alertsStore = createStore<ShownAlert[]>([])
export const useAlerts = <S>(sel: (a: ShownAlert[]) => S) => useStore(alertsStore, sel)

const seen = new Set<string>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let seq = 0

const minutesNow = (d = new Date()) => d.getHours() * 60 + d.getMinutes()

/** Marca como já avisado sem mostrar (o que já estava na tela ao abrir, ou o que o push já tocou) */
export function markSeen(keys: Iterable<string>) {
  for (const k of keys) seen.add(k)
}

export const wasSeen = (key: string) => seen.has(key)

function ring(sound: AlertSound, prefs: AlertPrefs) {
  if (prefs.sound) playSound(sound, prefs.volume)
  if (prefs.vibrate) vibrate(sound)
}

/** Mostra um aviso (se a categoria estiver ligada) e toca o som dele (se não estiver no silêncio) */
export function raiseAlert(c: AlertCandidate, now = new Date()): boolean {
  if (seen.has(c.key)) return false
  seen.add(c.key)
  const prefs = alertPrefsStore.get()
  const d = decide(prefs, c.category, minutesNow(now))
  if (!d.show) return false
  const a: ShownAlert = { ...c, id: ++seq, loud: d.loud }
  alertsStore.set((list) => {
    // o mais importante fica: ao passar do limite sai o mais antigo que não insiste
    let next = [...list.filter((x) => x.key !== c.key), a]
    while (next.length > MAX) {
      const drop = next.find((x) => !CATEGORY[x.category].sticky) ?? next[0]!
      next = next.filter((x) => x !== drop)
      clearTimer(drop.id)
    }
    return next
  })
  if (!CATEGORY[c.category].sticky) timers.set(a.id, setTimeout(() => dismissAlert(a.id), AUTO_DISMISS_MS))
  if (d.loud) ring(c.sound, prefs)
  return true
}

function clearTimer(id: number) {
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.delete(id)
}

export function dismissAlert(id: number) {
  clearTimer(id)
  alertsStore.set((list) => (list.some((a) => a.id === id) ? list.filter((a) => a.id !== id) : list))
}

/** Some com os avisos de um registro resolvido em outro lugar (dose confirmada na tela, pedido respondido) */
export function dismissWhere(pred: (a: ShownAlert) => boolean) {
  for (const a of alertsStore.get()) if (pred(a)) clearTimer(a.id)
  alertsStore.set((list) => (list.some(pred) ? list.filter((a) => !pred(a)) : list))
}

export function clearAlerts() {
  for (const id of timers.keys()) clearTimer(id)
  alertsStore.set(() => [])
}

/** Botão "Ouvir" dos Ajustes: toca mesmo com o som desligado e mostra um exemplo, sem passar pelo silêncio */
export function previewAlert(category: AlertCategory, sample: AlertCandidate) {
  const prefs = alertPrefsStore.get()
  playSound(sample.sound, prefs.volume)
  if (prefs.vibrate) vibrate(sample.sound)
  const a: ShownAlert = { ...sample, key: `preview:${category}:${++seq}`, id: seq, loud: true }
  alertsStore.set((list) => [...list.filter((x) => !x.key.startsWith('preview:')), a].slice(-MAX))
  timers.set(a.id, setTimeout(() => dismissAlert(a.id), 5000))
}
