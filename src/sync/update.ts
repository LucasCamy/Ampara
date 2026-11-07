import { flushSaves } from '../auth/session'
import { createStore, useStore } from '../store/createStore'

/**
 * Atualização do app instalado (PWA). No iPhone o app da Tela de Início não tem botão de recarregar e
 * continuava na versão antiga. Agora: /version.json (nunca em cache) é comparado com a versão deste build
 * ao abrir, ao voltar para o app e a cada 30 min; havendo versão nova, aparece o aviso [Atualizar].
 */

export interface UpdateState {
  current: string
  /** versão publicada no servidor, quando diferente da atual */
  available: string | null
  checking: boolean
  lastCheckedAt: string | null
}

export const updateStore = createStore<UpdateState>({ current: __APP_VERSION__, available: null, checking: false, lastCheckedAt: null })
export const useUpdate = <S>(sel: (s: UpdateState) => S) => useStore(updateStore, sel)

/** Pergunta ao servidor qual é a versão publicada. Devolve true se há versão nova. */
export async function checkForUpdate(): Promise<boolean> {
  if (!import.meta.env.PROD) return false
  updateStore.set((s) => ({ ...s, checking: true }))
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return false
    const { version } = (await res.json()) as { version?: string }
    const available = version && version !== __APP_VERSION__ ? version : null
    updateStore.set((s) => ({ ...s, available, lastCheckedAt: new Date().toISOString() }))
    // aproveita para o navegador buscar o service worker novo em segundo plano
    if (available) void navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => undefined)
    return !!available
  } catch {
    return false // sem internet: tenta de novo depois
  } finally {
    updateStore.set((s) => ({ ...s, checking: false }))
  }
}

/** Troca para a versão nova: salva o que falta, ativa o service worker novo e recarrega */
export async function applyUpdate(): Promise<void> {
  await flushSaves()
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
  if (reg) {
    await reg.update().catch(() => undefined)
    reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
  }
  location.reload()
}

let started = false
export function startUpdateChecks() {
  if (started || !import.meta.env.PROD) return
  started = true
  setTimeout(() => void checkForUpdate(), 3000)
  setInterval(() => void checkForUpdate(), 30 * 60_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate()
  })
}
