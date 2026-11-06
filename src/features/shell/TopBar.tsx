import { Lock, BatteryFull, BatteryLow, BatteryMedium, Cloud, CloudOff, Moon, RefreshCw, Settings, Sun, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { cx, Segmented } from '../../components/ui'
import type { EnergyLevel } from '../../domain/types'
import { setEnergy } from '../../store/actions'
import { usePeople } from '../../store/hooks'
import { ui, useUi } from '../../store/ui'
import { lock, switchPerson } from '../../auth/session'
import { useSync } from '../../sync/engine'

export const ENERGY: Record<EnergyLevel, { icon: LucideIcon; short: string; label: string; partner: string }> = {
  FULL: { icon: BatteryFull, short: '100%', label: '100% Cheia', partner: 'bateria cheia' },
  MEDIUM: { icon: BatteryMedium, short: '50%', label: '50% Média', partner: 'bateria média' },
  OVERLOAD: { icon: BatteryLow, short: '10%', label: '10% Sobrecarga', partner: 'modo sobrecarga' },
}

export function BatterySelector({ compactLabels = false }: { compactLabels?: boolean }) {
  const { me } = usePeople()
  return (
    <Segmented<EnergyLevel>
      label="Bateria mental"
      value={me.energy}
      onChange={setEnergy}
      size="sm"
      stretch
      options={(['FULL', 'MEDIUM', 'OVERLOAD'] as EnergyLevel[]).map((v) => ({
        value: v,
        icon: ENERGY[v].icon,
        label: compactLabels ? ENERGY[v].short : ENERGY[v].label,
        testId: `energy-${v}`,
      }))}
    />
  )
}

export function SyncPill() {
  const { online, syncing, pending, forced } = useSync()
  const state = !online ? 'offline' : syncing || pending > 0 ? 'syncing' : 'ok'
  const Icon = state === 'offline' ? CloudOff : state === 'syncing' ? RefreshCw : Cloud
  const text = state === 'offline' ? `Offline${pending ? ` · ${pending}` : ''}` : state === 'syncing' ? `Enviando ${pending}` : 'Sincronizado'
  const full =
    state === 'offline'
      ? `Modo offline, salvando no aparelho, ${pending} na fila`
      : state === 'syncing'
        ? `Sincronizando ${pending} alterações`
        : 'Sincronizado'
  return (
    <button
      type="button"
      onClick={() => ui.setForcedOffline(!forced)}
      data-testid="sync-pill"
      data-state={state}
      aria-label={`${full}. Tocar para ${forced ? 'voltar a sincronizar' : 'simular modo offline'}`}
      title={forced ? 'Voltar a sincronizar' : 'Simular modo offline'}
      className={cx(
        'press inline-flex min-h-10 min-w-0 items-center gap-1.5 overflow-hidden rounded-full border px-2.5 text-[12px] font-semibold whitespace-nowrap',
        state === 'offline' ? 'border-dashed border-warn bg-warn-soft text-warn' : state === 'syncing' ? 'border-dashed border-line-strong text-muted' : 'border-line text-muted',
      )}
    >
      <Icon size={15} aria-hidden />
      <span className="tabular truncate">{text}</span>
    </button>
  )
}

export function LockButton({ withLabel = false }: { withLabel?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => void lock()}
      aria-label="Bloquear o Ampara neste aparelho"
      data-testid="lock"
      className={cx('press hoverable inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full text-ink', withLabel ? 'px-3 text-[14px] font-semibold' : 'w-11')}
    >
      <Lock size={19} aria-hidden />
      {withLabel ? 'Bloquear' : null}
    </button>
  )
}

export function ThemeToggle() {
  const theme = useUi((s) => s.theme)
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => ui.setTheme(next)}
      aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
      data-testid="theme-toggle"
      className="press hoverable inline-flex h-11 w-11 items-center justify-center rounded-full text-ink"
    >
      {theme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
    </button>
  )
}

export function PerspectiveSwitch({ compact = false }: { compact?: boolean }) {
  const { profiles, viewer } = usePeople()
  return (
    <Segmented
      label="Perspectiva: quem está usando o app"
      value={viewer}
      onChange={(v) => {
        if (v !== viewer) void switchPerson(v)
      }}
      size="sm"
      stretch
      options={[
        { value: 'A', label: compact ? profiles.A.displayName : `Visão: ${profiles.A.displayName}`, shortLabel: profiles.A.displayName, testId: 'viewer-A', ariaLabel: viewer === 'A' ? `Usando como ${profiles.A.displayName}` : `Entrar como ${profiles.A.displayName} (pede a senha)` },
        { value: 'B', label: compact ? profiles.B.displayName : `Visão: ${profiles.B.displayName}`, shortLabel: profiles.B.displayName, testId: 'viewer-B', ariaLabel: viewer === 'B' ? `Usando como ${profiles.B.displayName}` : `Entrar como ${profiles.B.displayName} (pede a senha)` },
      ]}
    />
  )
}

/** Barra de contexto do casal (mobile e tablet) */
export function TopBar() {
  const { me } = usePeople()
  const [batteryOpen, setBatteryOpen] = useState(false)
  const E = ENERGY[me.energy]
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-line bg-bg lg:hidden">
      <div className="mx-auto flex max-w-[720px] items-center gap-1 px-4 pt-2">
        <span className="mr-auto shrink-0 text-[19px] font-extrabold tracking-tight text-ink">
          Ampara<span className="text-action">.</span>
        </span>
        <SyncPill />
        <button
          type="button"
          onClick={() => setBatteryOpen((o) => !o)}
          aria-expanded={batteryOpen}
          aria-controls="battery-panel"
          aria-label={`Bateria mental: ${E.label}. Alterar`}
          data-testid="battery-toggle"
          className={cx(
            'press inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-1.5 text-[12px] font-bold',
            me.energy === 'OVERLOAD' ? 'text-err' : 'text-ink',
          )}
        >
          <E.icon size={20} aria-hidden />
          <span className="tabular">{E.short}</span>
        </button>
        <button
          type="button"
          onClick={() => ui.setTab('ajustes')}
          aria-label="Ajustes e atalhos do iPhone"
          className="press hoverable inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink"
        >
          <Settings size={20} aria-hidden />
        </button>
      </div>
      {batteryOpen ? (
        <div id="battery-panel" className="mx-auto max-w-[720px] px-4 pt-1 pb-2">
          <p className="mb-1.5 text-[12px] font-semibold text-muted">Minha bateria mental agora</p>
          <BatterySelector compactLabels />
        </div>
      ) : (
        <div className="h-2" />
      )}
    </header>
  )
}

/** Linha de contexto que rola junto com a página no mobile (só a barra principal fica fixa) */
export function ContextRow() {
  return (
    <div className="mx-auto flex max-w-[720px] items-center gap-1 px-4 pt-3 lg:hidden">
      <div className="min-w-0 flex-1">
        <PerspectiveSwitch />
      </div>
      <LockButton />
      <ThemeToggle />
    </div>
  )
}
