import { createStore, useStore } from '../store/createStore'
import { cloudRpc } from './cloud'
import { toServerPrefs } from '../domain/alerts'
import { alertPrefsStore } from '../store/alerts'

/**
 * Lembretes com a tela bloqueada (Web Push). O servidor (worker) decide quando mandar; aqui só inscrevemos
 * este navegador na conta de quem está usando. Precisa da nuvem: sem ela o servidor não sabe dos remédios.
 * iPhone: só funciona com o app instalado na Tela de Início (iOS 16.4+).
 */

export type PushSupport = 'ok' | 'needs-install' | 'unsupported'

export interface PushState {
  /** null = ainda conferindo */
  subscribed: boolean | null
  showDetails: boolean
  busy: boolean
}

const DETAILS_KEY = 'ampara:push-details'
function loadShowDetails() {
  try { return localStorage.getItem(DETAILS_KEY) === '1' } catch { return false }
}
export const pushStore = createStore<PushState>({
  subscribed: null,
  showDetails: loadShowDetails(),
  busy: false,
})
export const usePush = <S>(sel: (s: PushState) => S) => useStore(pushStore, sel)

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported'
  // app do PC (app://ampara): lembretes ficam com o celular, onde o Web Push funciona
  if (typeof location !== 'undefined' && !/^https?:$/.test(location.protocol)) return 'unsupported'
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (ios && !standalone) return 'needs-install'
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? 'ok' : 'unsupported'
}

export const permission = (): NotificationPermission | 'unsupported' => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

/** Chave VAPID em base64url -> bytes (formato que o pushManager pede) */
export function vapidKeyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4)
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  // origens sem service worker (ex.: o app do PC em app://ampara) lançam SecurityError: sem lembretes aqui
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null
  } catch {
    return null
  }
}

export async function refreshPushState() {
  if (pushSupport() !== 'ok') return pushStore.set((s) => ({ ...s, subscribed: false }))
  const reg = await registration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  pushStore.set((s) => ({ ...s, subscribed: !!sub && permission() === 'granted' }))
}

async function save(sub: PushSubscription, showDetails: boolean) {
  const j = sub.toJSON()
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) throw new Error('O navegador não entregou a inscrição completa.')
  await cloudRpc('save_push_subscription', {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys.p256dh,
    p_auth: j.keys.auth,
    p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    p_show_details: showDetails,
    // categorias desligadas e horário de silêncio: o servidor nem manda o que a pessoa calou
    p_prefs: toServerPrefs(alertPrefsStore.get()),
  })
}

async function withBusy<T>(fn: () => Promise<T>): Promise<T> {
  pushStore.set((s) => ({ ...s, busy: true }))
  try {
    return await fn()
  } finally {
    pushStore.set((s) => ({ ...s, busy: false }))
  }
}

/** Pede a permissão (só depois do toque da pessoa) e inscreve este navegador */
export function enablePush(): Promise<void> {
  return withBusy(async () => {
    if (pushSupport() !== 'ok') throw new Error('Instale o Ampara na Tela de Início e ative os lembretes por lá.')
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') throw new Error(perm === 'denied' ? 'As notificações estão bloqueadas para o Ampara. Libere nas configurações do navegador.' : 'Permissão não concedida.')
    const key = await cloudRpc<string | null>('push_public_key', {})
    if (!key) throw new Error('O servidor de lembretes ainda não está ativo. Tente de novo em alguns minutos.')
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(key) })
    await save(sub, pushStore.get().showDetails)
    pushStore.set((s) => ({ ...s, subscribed: true }))
  })
}

export function disablePush(): Promise<void> {
  return withBusy(async () => {
    const reg = await registration()
    const sub = reg ? await reg.pushManager.getSubscription() : null
    if (sub) {
      await cloudRpc('delete_push_subscription', { p_endpoint: sub.endpoint }).catch(() => undefined)
      await sub.unsubscribe()
    }
    pushStore.set((s) => ({ ...s, subscribed: false }))
  })
}

/** Mostrar o nome do remédio na tela bloqueada (desligado por padrão: é dado de saúde) */
export function setShowDetails(value: boolean): Promise<void> {
  try { localStorage.setItem(DETAILS_KEY, value ? '1' : '0') } catch { /* preferência vale na sessão */ }
  pushStore.set((s) => ({ ...s, showDetails: value }))
  return withBusy(async () => {
    const reg = await registration()
    const sub = reg ? await reg.pushManager.getSubscription() : null
    if (sub) await save(sub, value)
  })
}

let prefsTimer: ReturnType<typeof setTimeout> | undefined
let prefsSuperseded: (() => void) | undefined
/** Preferências de aviso mudaram: reenvia a inscrição (agrupa toques seguidos num envio só) */
export function syncPushPrefs(): Promise<void> {
  if (prefsTimer) clearTimeout(prefsTimer)
  // o envio anterior foi absorvido por este: quem esperava por ele não fica pendurado
  prefsSuperseded?.()
  return new Promise((resolve, reject) => {
    prefsSuperseded = resolve
    prefsTimer = setTimeout(() => {
      prefsSuperseded = undefined
      void (async () => {
        if (pushSupport() !== 'ok' || permission() !== 'granted') return
        const reg = await registration()
        const sub = reg ? await reg.pushManager.getSubscription() : null
        if (sub) await save(sub, pushStore.get().showDetails)
      })().then(resolve, reject)
    }, 600)
  })
}
