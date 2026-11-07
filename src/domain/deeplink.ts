import type { SheetKind, Tab } from '../store/ui'

/** Lê um destino do app (#/aba e ?quick=) de uma URL. Puro: sem navegador. */

const QUICK: Record<string, SheetKind> = { task: 'task', expense: 'expense', med: 'med', sos: 'sos' }
const TABS: Tab[] = ['hoje', 'agenda', 'nos', 'rotinas', 'financas', 'ajustes']
export const EXTRA = ['title', 'amount', 'scope'] as const

export interface DeepLink {
  tab: Tab | null
  quick: SheetKind | null
  params: Record<string, string>
}

export function parseDeepLink(href: string, base = 'https://app.local'): DeepLink | null {
  let url: URL
  try {
    url = new URL(href, base)
  } catch {
    return null
  }
  const tabRaw = url.hash.replace(/^#\//, '')
  const tab = (TABS as string[]).includes(tabRaw) ? (tabRaw as Tab) : null
  const quickRaw = url.searchParams.get('quick')
  const quick = quickRaw ? (QUICK[quickRaw] ?? null) : null
  const params: Record<string, string> = {}
  for (const k of EXTRA) {
    const v = url.searchParams.get(k)
    if (v) params[k] = v.slice(0, 80)
  }
  return tab || quick ? { tab, quick, params } : null
}

