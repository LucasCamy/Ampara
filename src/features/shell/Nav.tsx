import { CalendarDays, CircleCheck, Heart, HeartPulse, LifeBuoy, ListPlus, ReceiptText, Settings, Sun, Wallet, type LucideIcon } from 'lucide-react'
import { cx } from '../../components/ui'
import { ui, useUi, type SheetKind, type Tab } from '../../store/ui'
import { BatterySelector, LockButton, PerspectiveSwitch, SyncPill, ThemeToggle } from './TopBar'

export const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'hoje', label: 'Hoje', icon: Sun },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'nos', label: 'Nós', icon: Heart },
  { id: 'rotinas', label: 'Cuidados', icon: HeartPulse },
  { id: 'financas', label: 'Finanças', icon: Wallet },
]

export const QUICK: { kind: SheetKind; label: string; short: string; icon: LucideIcon }[] = [
  { kind: 'task', label: 'Tarefa rápida', short: 'Tarefa', icon: ListPlus },
  { kind: 'expense', label: 'Registrar gasto', short: 'Gasto', icon: ReceiptText },
  { kind: 'med', label: 'Confirmar remédio', short: 'Remédio', icon: CircleCheck },
  { kind: 'sos', label: 'Pedir ajuda', short: 'Ajuda', icon: LifeBuoy },
]

export function BottomNav() {
  const tab = useUi((s) => s.tab)
  return (
    <nav aria-label="Navegação principal" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface lg:hidden">
      <ul className="mx-auto grid max-w-[720px] grid-cols-5">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => ui.setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                data-testid={`nav-${t.id}`}
                className={cx('press flex min-h-[60px] w-full flex-col items-center justify-center gap-0.5 text-[12px] font-semibold', active ? 'text-action' : 'text-muted')}
              >
                <t.icon size={22} aria-hidden strokeWidth={active ? 2.4 : 2} />
                {t.label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Dock flutuante ARQ-E: captura em 1 toque, acima da Bottom Nav no mobile */
export function Dock() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-30 px-3 lg:hidden">
      <div
        role="toolbar"
        aria-label="Captura rápida"
        className="pointer-events-auto mx-auto grid max-w-[520px] grid-cols-4 gap-1 rounded-[24px] border border-line bg-surface p-1.5 shadow-float"
      >
        {QUICK.map((q) => (
          <button
            key={q.kind}
            type="button"
            onClick={() => ui.openSheet(q.kind)}
            aria-label={q.label}
            data-testid={`dock-${q.kind}`}
            className={cx(
              'press flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[18px] text-[12px] font-bold',
              q.kind === 'sos' ? 'bg-err-soft text-err' : q.kind === 'task' ? 'btn-primary' : 'hoverable text-ink',
            )}
          >
            <q.icon size={20} aria-hidden />
            {q.short}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Sidebar do desktop: recompõe navegação + captura rápida + contexto do casal */
export function Sidebar() {
  const tab = useUi((s) => s.tab)
  return (
    <aside className="sticky top-0 hidden h-dvh w-[288px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-surface px-4 py-5 lg:flex">
      <div className="flex items-center justify-between px-1">
        <span className="text-[22px] font-extrabold tracking-tight text-ink">
          Ampara<span className="text-action">.</span>
        </span>
        <ThemeToggle />
      </div>
      <div>
        <p className="mb-1.5 px-1 text-[12px] font-semibold text-muted">Visão de quem está usando</p>
        <PerspectiveSwitch compact />
      </div>
      <div>
        <p className="mb-1.5 px-1 text-[12px] font-semibold text-muted">Minha bateria mental</p>
        <BatterySelector compactLabels fill />
      </div>
      <nav aria-label="Navegação principal">
        <ul className="flex flex-col gap-1">
          {[...TABS, { id: 'ajustes' as Tab, label: 'Ajustes e atalhos', icon: Settings }].map((t) => {
            const active = tab === t.id
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => ui.setTab(t.id)}
                  aria-current={active ? 'page' : undefined}
                  data-testid={`side-${t.id}`}
                  className={cx(
                    'press flex min-h-12 w-full items-center gap-3 rounded-[14px] px-3 text-[15px] font-semibold',
                    active ? 'bg-selected text-ink' : 'hoverable text-muted',
                  )}
                >
                  <t.icon size={20} aria-hidden className={active ? 'text-action' : ''} />
                  {t.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
      <div>
        <p className="mb-2 px-1 text-[12px] font-semibold text-muted">Captura rápida</p>
        <div className="grid grid-cols-2 gap-2">
          {QUICK.map((q) => (
            <button
              key={q.kind}
              type="button"
              onClick={() => ui.openSheet(q.kind)}
              data-testid={`side-quick-${q.kind}`}
              className={cx(
                'press flex min-h-12 items-center gap-2 rounded-[14px] px-3 text-[14px] font-semibold',
                q.kind === 'sos' ? 'bg-err-soft text-err' : q.kind === 'task' ? 'btn-primary' : 'bg-subtle text-ink hoverable',
              )}
            >
              <q.icon size={18} aria-hidden />
              {q.short}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <SyncPill />
        <LockButton withLabel />
      </div>
    </aside>
  )
}
