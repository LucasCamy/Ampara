import { Droplet, Volume2 } from 'lucide-react'
import { ALERT_CATEGORIES, CATEGORY, inQuietHours, type AlertCategory, type AlertPrefs, type AlertVolume } from '../../domain/alerts'
import { PickerInput } from '../../components/pickers'
import { cx, SectionHeader, Segmented, StatusBadge, Switch } from '../../components/ui'
import { previewAlert, setAlertPrefs, useAlertPrefs } from '../../store/alerts'
import { useNow } from '../../store/clock'
import { syncPushPrefs } from '../../sync/push'
import { ALERT_SAMPLE, CATEGORY_UI, WATER_SAMPLE } from '../alerts/AlertCards'

/**
 * Ajustes > Aparelho: quais avisos aparecem, com que som, volume e vibração, e o horário de silêncio.
 * É deste aparelho (cada um escolhe no seu celular). Categorias desligadas e o silêncio também valem para a
 * tela bloqueada: vão junto com a inscrição de push.
 */
export function AlertsSection() {
  const prefs = useAlertPrefs((p) => p)
  const now = useNow()
  const quietNow = inQuietHours(prefs.quiet, now.getHours() * 60 + now.getMinutes())

  const update = (fn: (p: AlertPrefs) => AlertPrefs, server = false) => {
    setAlertPrefs(fn)
    if (server) void syncPushPrefs().catch(() => undefined)
  }
  const toggle = (c: AlertCategory, on: boolean) => update((p) => ({ ...p, enabled: { ...p.enabled, [c]: on } }), true)

  return (
    <section className="module p-4 sm:p-5" aria-labelledby="avisos" data-testid="alerts-section">
      <SectionHeader id="avisos" title="Avisos" rest="· som e jeito de cada um" />
      <p className="text-[14px] text-muted">Cada tipo de aviso tem cor, som e vibração próprios. Toque em Ouvir para conhecer.</p>

      <ul className="mt-4 flex flex-col divide-y divide-line">
        {ALERT_CATEGORIES.map((c) => {
          const ui = CATEGORY_UI[c]
          const Icon = ui.icon
          return (
            <li key={c} className="flex flex-col gap-2 py-3 first:pt-0" data-testid={`alert-cat-${c}`}>
              <div className="flex items-start gap-3">
                <span className={cx('mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-subtle', ui.tone)}>
                  <Icon size={20} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <Switch checked={prefs.enabled[c]} onChange={(v) => toggle(c, v)} testId={`alert-toggle-${c}`} label={CATEGORY[c].label} description={CATEGORY[c].description} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-[52px]">
                <ListenButton testId={`alert-listen-${c}`} onClick={() => previewAlert(c, ALERT_SAMPLE[c])} label={`Ouvir o som de ${CATEGORY[c].label}`}>
                  Ouvir
                </ListenButton>
                {c === 'med' ? (
                  <ListenButton testId="alert-listen-water" onClick={() => previewAlert(c, WATER_SAMPLE)} label="Ouvir o som do pegou a água" icon="water">
                    Pegou a água?
                  </ListenButton>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-2 flex flex-col gap-4 border-t border-line pt-4">
        <Switch checked={prefs.sound} onChange={(v) => update((p) => ({ ...p, sound: v }))} testId="alert-sound" label="Tocar som com o app aberto" description="Com o app fechado, o som é o padrão do celular." />
        {prefs.sound ? (
          <Segmented<AlertVolume>
            label="Volume dos avisos"
            hideLabel={false}
            size="sm"
            fill
            value={prefs.volume}
            onChange={(v) => update((p) => ({ ...p, volume: v }))}
            options={[
              { value: 'LOW', label: 'Baixo', testId: 'alert-volume-low' },
              { value: 'MEDIUM', label: 'Médio', testId: 'alert-volume-medium' },
              { value: 'HIGH', label: 'Alto', testId: 'alert-volume-high' },
            ]}
          />
        ) : null}
        <Switch checked={prefs.vibrate} onChange={(v) => update((p) => ({ ...p, vibrate: v }))} testId="alert-vibrate" label="Vibrar" description="Cada tipo vibra de um jeito. Só no Android: o iPhone não deixa." />
      </div>

      <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
        <Switch
          checked={prefs.quiet.on}
          onChange={(v) => update((p) => ({ ...p, quiet: { ...p.quiet, on: v } }), true)}
          testId="alert-quiet"
          label="Horário de silêncio"
          description="Os avisos continuam aparecendo no app, mas sem som nem vibração. Na tela bloqueada, não chegam."
        />
        {prefs.quiet.on ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TimeInput label="Das" value={prefs.quiet.start} testId="alert-quiet-start" onChange={(v) => update((p) => ({ ...p, quiet: { ...p.quiet, start: v } }), true)} />
              <TimeInput label="Até" value={prefs.quiet.end} testId="alert-quiet-end" onChange={(v) => update((p) => ({ ...p, quiet: { ...p.quiet, end: v } }), true)} />
            </div>
            <div>
              {quietNow ? <StatusBadge kind="pending">Em silêncio agora</StatusBadge> : <StatusBadge kind="ok">Fora do silêncio agora</StatusBadge>}
            </div>
            <Switch
              checked={prefs.quiet.helpBreaks}
              onChange={(v) => update((p) => ({ ...p, quiet: { ...p.quiet, helpBreaks: v } }), true)}
              testId="alert-quiet-help"
              label="Pedido de ajuda toca mesmo assim"
              description="Recomendado: quem pede ajuda de madrugada precisa de verdade."
            />
          </>
        ) : null}
      </div>
    </section>
  )
}

function ListenButton({ onClick, label, testId, children, icon }: { onClick: () => void; label: string; testId: string; children: string; icon?: 'water' }) {
  const Icon = icon === 'water' ? Droplet : Volume2
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid={testId}
      className={cx('press hoverable inline-flex min-h-11 items-center gap-1.5 rounded-[14px] border border-line-strong bg-surface px-3.5 text-[14px] font-semibold text-ink', icon === 'water' && 'border-dashed')}
    >
      <Icon size={16} aria-hidden />
      {children}
    </button>
  )
}

function TimeInput({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <PickerInput id={testId} type="time" value={value} onChange={(v) => v && onChange(v)} invalid={false} testId={testId} />
    </label>
  )
}
