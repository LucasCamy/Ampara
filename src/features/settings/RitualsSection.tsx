import { Coffee, Moon, Sunrise } from 'lucide-react'
import { useId } from 'react'
import { PickerInput } from '../../components/pickers'
import { SectionHeader, Switch } from '../../components/ui'
import { isTimeKey } from '../../domain/catalog'
import { RITUAL_WINDOWS, type RitualSchedule, type RitualWindow } from '../../domain/rituals'
import { alertPrefs, useAlertPrefs } from '../../store/alerts'
import { syncPushPrefs } from '../../sync/push'

const WINDOWS = {
  morning: { label: 'Manhã', description: 'Resumo curto do dia e uma escolha de bateria mental.', icon: Sunrise },
  afternoon: { label: 'Tarde', description: 'Opcional: um convite para conferir o ritmo e aliviar o que puder.', icon: Coffee },
  evening: { label: 'Fechamento leve', description: 'Celebre os cuidados de hoje e leve pendências para amanhã.', icon: Moon },
}

export function RitualsSection() {
  const schedules = useAlertPrefs((prefs) => prefs.rituals)
  const id = useId()
  const update = (window: RitualWindow, patch: Partial<RitualSchedule>) => {
    alertPrefs.setRitualSchedule(window, patch)
    void syncPushPrefs().catch(() => undefined)
  }
  return (
    <section className="module p-4 sm:p-5" aria-labelledby="rituais" data-testid="rituals-section">
      <SectionHeader id="rituais" title="Rituais do seu dia" />
      <p className="text-[14px] text-muted">Pequenos convites no Hoje, uma vez por janela a cada dia. Escolha os horários deste aparelho. Você pode dispensar quando quiser.</p>
      <ul className="mt-4 flex flex-col gap-4 divide-y divide-line">
        {RITUAL_WINDOWS.map((window) => {
          const { label, description, icon: Icon } = WINDOWS[window]
          const schedule = schedules[window]
          const fieldId = `${id}-${window}`
          return (
            <li key={window} className="pt-4 first:pt-0">
              <Switch
                label={<span className="inline-flex items-center gap-2"><Icon size={18} aria-hidden className="text-action" /> {label}</span>}
                description={description}
                checked={schedule.enabled}
                onChange={(enabled) => update(window, { enabled })}
                testId={`ritual-enable-${window}`}
              />
              {schedule.enabled ? (
                <label htmlFor={fieldId} className="mt-3 block">
                  <span className="mb-2 block text-[14px] font-semibold text-ink">Horário · {label.toLowerCase()}</span>
                  <PickerInput id={fieldId} type="time" value={schedule.time} onChange={(time) => { if (isTimeKey(time)) update(window, { time }) }} testId={`ritual-time-${window}`} />
                </label>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
