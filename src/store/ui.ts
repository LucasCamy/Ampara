import type { PartnerId } from '../domain/types'
import { createStore, useStore } from './createStore'

export type Tab = 'hoje' | 'agenda' | 'rotinas' | 'financas' | 'ajustes'
export type SheetKind = 'task' | 'expense' | 'med' | 'sos' | 'newMed' | 'routine' | 'event'
export type Theme = 'light' | 'dark'

export interface SheetState {
  kind: SheetKind
  /** Parâmetros de abertura (pré-preenchimento vindo de atalho ou contexto) */
  params: Record<string, string>
}

export interface Toast {
  id: number
  message: string
  undo?: () => void
  tone: 'ok' | 'info' | 'warn'
}

export interface UiState {
  viewer: PartnerId
  tab: Tab
  theme: Theme
  forcedOffline: boolean
  sheet: SheetState | null
  toasts: Toast[]
}

const PREFS_KEY = 'ampara:prefs'
const TABS: Tab[] = ['hoje', 'agenda', 'rotinas', 'financas', 'ajustes']

function loadPrefs(): Partial<UiState> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<UiState>
  } catch {
    return {}
  }
}

function initialTab(): Tab {
  const h = typeof location !== 'undefined' ? location.hash.replace('#/', '') : ''
  return (TABS as string[]).includes(h) ? (h as Tab) : 'hoje'
}

function systemTheme(): Theme {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const prefs = loadPrefs()
export const uiStore = createStore<UiState>({
  // quem está usando vem da sessão autenticada (src/auth/session.ts), nunca das preferências
  viewer: 'A',
  tab: initialTab(),
  theme: prefs.theme ?? systemTheme(),
  forcedOffline: prefs.forcedOffline ?? false,
  sheet: null,
  toasts: [],
})

uiStore.subscribe(() => {
  const s = uiStore.get()
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: s.theme, forcedOffline: s.forcedOffline }))
  } catch {
    /* armazenamento indisponível: preferências ficam só na sessão */
  }
  document.documentElement.dataset.theme = s.theme
})

export const useUi = <S>(sel: (s: UiState) => S) => useStore(uiStore, sel)

let toastSeq = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()

/** Ações estáveis: módulo, não hook. Componentes chamam sem re-render. */
export const ui = {
  setViewer(viewer: PartnerId) {
    uiStore.set((s) => ({ ...s, viewer }))
  },
  setTab(tab: Tab) {
    uiStore.set((s) => (s.tab === tab ? s : { ...s, tab }))
    if (location.hash !== `#/${tab}`) history.replaceState(null, '', `${location.pathname}${location.search}#/${tab}`)
    window.scrollTo({ top: 0 })
  },
  setTheme(theme: Theme) {
    uiStore.set((s) => ({ ...s, theme }))
  },
  setForcedOffline(forcedOffline: boolean) {
    uiStore.set((s) => ({ ...s, forcedOffline }))
  },
  openSheet(kind: SheetKind, params: Record<string, string> = {}) {
    uiStore.set((s) => ({ ...s, sheet: { kind, params } }))
  },
  /** Mesmo comportamento dos atalhos ?quick=, sem recarregar a página (a sessão em memória continua aberta) */
  launchQuick(kind: SheetKind, params: Record<string, string> = {}) {
    if (kind === 'med' || kind === 'sos') ui.setTab('hoje')
    ui.openSheet(kind, params)
  },
  closeSheet() {
    uiStore.set((s) => (s.sheet ? { ...s, sheet: null } : s))
  },
  toast(message: string, opts: { undo?: () => void; tone?: Toast['tone'] } = {}) {
    const id = ++toastSeq
    const t: Toast = { id, message, tone: opts.tone ?? 'ok', ...(opts.undo ? { undo: opts.undo } : {}) }
    uiStore.set((s) => ({ ...s, toasts: [...s.toasts.slice(-2), t] }))
    timers.set(
      id,
      setTimeout(() => ui.dismissToast(id), 5000),
    )
  },
  dismissToast(id: number) {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
    uiStore.set((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const t = initialTab()
    uiStore.set((s) => (s.tab === t ? s : { ...s, tab: t }))
  })
}
