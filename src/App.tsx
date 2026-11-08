import { lazy, Suspense, useEffect } from 'react'
import { Toaster } from './components/Toaster'
import { ScreenSkeleton } from './components/Skeleton'
import { BottomNav, Dock, Sidebar } from './features/shell/Nav'
import { UpdateBanner } from './features/shell/UpdateBanner'
import { ContextRow, TopBar } from './features/shell/TopBar'
import { LoadingScreen, LoginScreen, SetupScreen, WelcomeScreen } from './features/auth/AuthScreens'
import { useAuth } from './auth/session'
import { SheetHost } from './features/sheets/SheetHost'
import { TodayScreen } from './features/today/TodayScreen'
import { ui, uiStore, useUi, type Tab } from './store/ui'
import { tourSeen } from './features/sheets/TourSheet'
import { consumeLaunchLink } from './sync/deeplink'
import { useData } from './store/data'
import { useNow } from './store/clock'
import { toDateKey } from './domain/dates'
import { materializeRecurrences } from './store/financeActions'
import { useAlertWatch } from './features/alerts/watch'

/** Entrar no lugar certo: /?quick=task|expense|med|sos, #/aba, ou o destino de uma notificação que esperou o login */
function useQuickLaunch() {
  useEffect(() => {
    consumeLaunchLink()
  }, [])
}

/**
 * Abas além do Hoje carregam sob demanda (o primeiro download do celular fica menor). Logo depois de abrir,
 * com o app ocioso, elas são pré-carregadas: o service worker guarda e o app continua funcionando offline.
 */
const loadAgenda = () => import('./features/agenda/AgendaScreen').then((m) => ({ default: m.AgendaScreen }))
const loadUs = () => import('./features/us/UsScreen').then((m) => ({ default: m.UsScreen }))
const loadRoutines = () => import('./features/routines/RoutinesScreen').then((m) => ({ default: m.RoutinesScreen }))
const loadFinance = () => import('./features/finance/FinanceScreen').then((m) => ({ default: m.FinanceScreen }))
const loadSettings = () => import('./features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen }))
const AgendaScreen = lazy(loadAgenda)
const UsScreen = lazy(loadUs)
const RoutinesScreen = lazy(loadRoutines)
const FinanceScreen = lazy(loadFinance)
const SettingsScreen = lazy(loadSettings)

function usePrefetchTabs() {
  useEffect(() => {
    const run = () => void Promise.all([loadAgenda(), loadUs(), loadRoutines(), loadFinance(), loadSettings()]).catch(() => undefined)
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    const id = idle ? idle(run) : window.setTimeout(run, 1500)
    return () => {
      if (!idle) window.clearTimeout(id)
    }
  }, [])
}

function Screen() {
  const tab = useUi((s) => s.tab)
  return (
    <Suspense fallback={<ScreenSkeleton />}>
      <TabScreen tab={tab} />
    </Suspense>
  )
}

function TabScreen({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'hoje':
      return <TodayScreen />
    case 'agenda':
      return <AgendaScreen />
    case 'nos':
      return <UsScreen />
    case 'rotinas':
      return <RoutinesScreen />
    case 'financas':
      return <FinanceScreen />
    case 'ajustes':
      return <SettingsScreen />
  }
}

/** Contas fixas: gera as próximas ocorrências ao abrir, ao virar o mês e quando uma regra muda */
function useRecurrences() {
  const rules = useData((s) => s.recurrences)
  const viewer = useUi((s) => s.viewer)
  const month = toDateKey(useNow()).slice(0, 7)
  useEffect(() => {
    materializeRecurrences()
  }, [rules, viewer, month])
}

/** Primeira vez de cada pessoa neste aparelho: apresentação curta (depois de qualquer destino de link) */
function useTour() {
  const viewer = useUi((s) => s.viewer)
  useEffect(() => {
    if (tourSeen(viewer) || uiStore.get().sheet) return
    const id = window.setTimeout(() => {
      if (!uiStore.get().sheet) ui.openSheet('tour')
    }, 600)
    return () => window.clearTimeout(id)
  }, [viewer])
}

function AppShell() {
  useQuickLaunch()
  useRecurrences()
  usePrefetchTabs()
  useTour()
  useAlertWatch()
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
          <UpdateBanner />
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
