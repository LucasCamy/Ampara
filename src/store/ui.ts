import type { PartnerId } from '../domain/types'
import { createStore, useStore } from './createStore'

export type Tab = 'hoje' | 'agenda' | 'nos' | 'rotinas' | 'financas' | 'ideias' | 'ajustes'
export type SheetKind = 'task' | 'expense' | 'med' | 'sos' | 'unstuck' | 'templates' | 'newMed' | 'routine' | 'event' | 'period' | 'cycleSetup' | 'specialDate' | 'gift' | 'goal' | 'pay' | 'tx' | 'rule' | 'tour' | 'quickCapture' | 'idea' | 'organizeIdea' | 'concretize' | 'askIdeas'
export type Theme = 'light' | 'dark'
export type ReadingFont = 'jakarta' | 'lexend' | 'atkinson'
export type ReadingComfort = 'default' | 'wide'
export type AgendaView = 'DAY' | 'WEEK' | 'MONTH' | 'INBOX'
export type SettingsGroup = 'casal' | 'nuvem' | 'aparelho' | 'atalhos'

export interface SheetState {
  kind: SheetKind
  /** Parâmetros de abertura (pré-preenchimento vindo de atalho ou contexto) */
  params: Record<string, string>
}

export interface Toast {
  id: number
  message: string
  undo?: () => void
  action?: { label: string; onClick: () => void }
  tone: 'ok' | 'info' | 'warn'
}

export interface UiState {
  viewer: PartnerId
  tab: Tab
  theme: Theme
  readingFont: ReadingFont
  readingComfort: ReadingComfort
  forcedOffline: boolean
  sheet: SheetState | null
  agendaView?: AgendaView
  unstuckStep?: 1 | 2 | 3
  settingsGroup?: SettingsGroup
  toasts: Toast[]
}

const PREFS_KEY = 'ampara:prefs'
const TABS: Tab[] = ['hoje', 'agenda', 'nos', 'rotinas', 'financas', 'ideias', 'ajustes']

function loadPrefs(): Partial<UiState> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const value = raw as Record<string, unknown>
    return {
      theme: value.theme === 'light' || value.theme === 'dark' ? value.theme : undefined,
      forcedOffline: typeof value.forcedOffline === 'boolean' ? value.forcedOffline : undefined,
      readingFont: value.readingFont === 'lexend' || value.readingFont === 'atkinson' ? value.readingFont : 'jakarta',
      readingComfort: value.readingComfort === 'wide' ? 'wide' : 'default',
    }
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
  readingFont: prefs.readingFont ?? 'jakarta',
  readingComfort: prefs.readingComfort ?? 'default',
  forcedOffline: prefs.forcedOffline ?? false,
  sheet: null,
  toasts: [],
})

uiStore.subscribe(() => {
  const s = uiStore.get()
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: s.theme, forcedOffline: s.forcedOffline, readingFont: s.readingFont, readingComfort: s.readingComfort }))
  } catch {
    /* armazenamento indisponível: preferências ficam só na sessão */
  }
  applyTheme(s.theme)
  applyReading(s.readingFont, s.readingComfort)
})

let appliedTheme: Theme | null = null
/**
 * Aplica o tema do app (não o do sistema) e pinta a barra de status com o fundo do próprio tema:
 * o theme-color do index.html segue o sistema e deixava o topo claro com o app no escuro.
 */
export function applyTheme(theme: Theme) {
  if (theme === appliedTheme) return
  appliedTheme = theme
  const root = document.documentElement
  root.dataset.theme = theme
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
  if (!bg) return
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute('media')
    m.content = bg
  })
}

/** Preferência de leitura é deste aparelho e também vale na tela de entrada. */
let appliedReading: string | null = null
export function applyReading(font: ReadingFont, comfort: ReadingComfort) {
  if (typeof document === 'undefined') return
  const value = `${font}/${comfort}`
  if (value === appliedReading) return
  appliedReading = value
  document.documentElement.dataset.font = font
  document.documentElement.dataset.reading = comfort
}

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
  setReadingFont(readingFont: ReadingFont) {
    uiStore.set((s) => s.readingFont === readingFont ? s : { ...s, readingFont })
  },
  setReadingComfort(readingComfort: ReadingComfort) {
    uiStore.set((s) => s.readingComfort === readingComfort ? s : { ...s, readingComfort })
  },
  setAgendaView(agendaView: AgendaView) {
    uiStore.set((s) => ({ ...s, agendaView }))
  },
  openInbox() {
    ui.setAgendaView('INBOX')
    ui.setTab('agenda')
  },
  setSettingsGroup(settingsGroup: SettingsGroup) {
    uiStore.set((s) => ({ ...s, settingsGroup }))
  },
  openSettings(settingsGroup: SettingsGroup) {
    ui.setSettingsGroup(settingsGroup)
    ui.setTab('ajustes')
  },
  setForcedOffline(forcedOffline: boolean) {
    uiStore.set((s) => ({ ...s, forcedOffline }))
  },
  openSheet(kind: SheetKind, params: Record<string, string> = {}) {
    uiStore.set((s) => ({ ...s, sheet: { kind, params }, unstuckStep: 1 }))
  },
  setUnstuckStep(unstuckStep: 1 | 2 | 3) {
    uiStore.set((s) => ({ ...s, unstuckStep }))
  },
  /** Mesmo comportamento dos atalhos ?quick=, sem recarregar a página (a sessão em memória continua aberta) */
  launchQuick(kind: SheetKind, params: Record<string, string> = {}) {
    if (kind === 'med' || kind === 'sos') ui.setTab('hoje')
    ui.openSheet(kind, params)
  },
  closeSheet() {
    uiStore.set((s) => (s.sheet ? { ...s, sheet: null } : s))
  },
  toast(message: string, opts: { undo?: () => void; action?: Toast['action']; tone?: Toast['tone'] } = {}) {
    const id = ++toastSeq
    const t: Toast = { id, message, tone: opts.tone ?? 'ok', ...(opts.undo ? { undo: opts.undo } : {}), ...(opts.action ? { action: opts.action } : {}) }
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
