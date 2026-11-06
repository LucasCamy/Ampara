import { useEffect } from 'react'
import { Toaster } from './components/Toaster'
import { AgendaScreen } from './features/agenda/AgendaScreen'
import { FinanceScreen } from './features/finance/FinanceScreen'
import { RoutinesScreen } from './features/routines/RoutinesScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { BottomNav, Dock, Sidebar } from './features/shell/Nav'
import { ContextRow, TopBar } from './features/shell/TopBar'
import { LoadingScreen, LoginScreen, SetupScreen, WelcomeScreen } from './features/auth/AuthScreens'
import { useAuth } from './auth/session'
import { SheetHost } from './features/sheets/SheetHost'
import { TodayScreen } from './features/today/TodayScreen'
import { ui, useUi, type SheetKind } from './store/ui'

const QUICK_KINDS: Record<string, SheetKind> = { task: 'task', expense: 'expense', med: 'med', sos: 'sos' }

/** Atalhos do iPhone: /?quick=task|expense|med|sos (+ title, amount) */
function useQuickLaunch() {
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const quick = params.get('quick')
    const kind = quick ? QUICK_KINDS[quick] : undefined
    if (!kind) return
    const extra: Record<string, string> = {}
    for (const k of ['title', 'amount', 'scope']) {
      const v = params.get(k)
      if (v) extra[k] = v
    }
    if (kind === 'med' || kind === 'sos') ui.setTab('hoje')
    ui.openSheet(kind, extra)
    params.delete('quick')
    for (const k of ['title', 'amount', 'scope']) params.delete(k)
    const qs = params.toString()
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`)
  }, [])
}

function Screen() {
  const tab = useUi((s) => s.tab)
  switch (tab) {
    case 'hoje':
      return <TodayScreen />
    case 'agenda':
      return <AgendaScreen />
    case 'rotinas':
      return <RoutinesScreen />
    case 'financas':
      return <FinanceScreen />
    case 'ajustes':
      return <SettingsScreen />
  }
}

function AppShell() {
  useQuickLaunch()
  return (
    <div className="flex min-h-dvh" data-testid="app">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-[12px] focus:bg-surface focus:p-3">
        Pular para o conteúdo
      </a>
      <Sidebar />
      <div className="min-w-0 flex-1">
        <TopBar />
        <ContextRow />
        <main id="conteudo" className="mx-auto w-full max-w-[720px] px-4 pt-4 pb-[calc(160px+env(safe-area-inset-bottom))] lg:max-w-[1180px] lg:px-8 lg:pt-8 lg:pb-12">
          <Screen />
        </main>
      </div>
      <Dock />
      <BottomNav />
      <SheetHost />
      <Toaster />
    </div>
  )
}

/** Nada do casal aparece antes da autenticação */
export default function Root() {
  const status = useAuth((s) => s.status)
  switch (status) {
    case 'loading':
      return <LoadingScreen />
    case 'setup':
      return <SetupScreen />
    case 'welcome':
      return <WelcomeScreen />
    case 'locked':
      return <LoginScreen />
    case 'unlocked':
      return <AppShell />
  }
}
