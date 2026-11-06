import { useState, type FormEvent } from 'react'
import { TextField } from '../../components/ui'
import { CYCLE_DAYS_RANGE, defaultCycleSettings, parseDays, PERIOD_DAYS_RANGE } from '../../domain/cycle'
import { updateCycleSettings } from '../../store/cycleActions'
import { dataStore } from '../../store/data'
import { ui, uiStore } from '../../store/ui'
import { SHEET_FORM } from './forms'

/** Duração típica do ciclo e da menstruação (vale até o histórico ter pelo menos 2 ciclos) */
export function CycleSetupSheet({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState(() => {
    const who = uiStore.get().viewer
    const s = dataStore.get().cycleSettings[who] ?? defaultCycleSettings(who, '')
    return { cycleDays: String(s.cycleDays), periodDays: String(s.periodDays) }
  })
  const [errors, setErrors] = useState<{ cycleDays?: string; periodDays?: string }>({})

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const cycleDays = parseDays(form.cycleDays, CYCLE_DAYS_RANGE)
    const periodDays = parseDays(form.periodDays, PERIOD_DAYS_RANGE)
    const next = {
      cycleDays: cycleDays === null ? `Um número de ${CYCLE_DAYS_RANGE.min} a ${CYCLE_DAYS_RANGE.max}.` : undefined,
      periodDays: periodDays === null ? `Um número de ${PERIOD_DAYS_RANGE.min} a ${PERIOD_DAYS_RANGE.max}.` : undefined,
    }
    setErrors(next)
    if (cycleDays === null || periodDays === null) return
    updateCycleSettings({ cycleDays, periodDays })
    ui.toast('Durações salvas')
    onDone()
  }

  return (
    <form id={SHEET_FORM.cycleSetup} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Ciclo (dias)"
          value={form.cycleDays}
          onChange={(v) => {
            setForm((f) => ({ ...f, cycleDays: v.replace(/\D/g, '') }))
            setErrors((er) => ({ ...er, cycleDays: undefined }))
          }}
          error={errors.cycleDays}
          inputMode="numeric"
          maxLength={2}
          data
          testId="cycle-days"
          hint="Do 1º dia de uma ao 1º dia da próxima."
        />
        <TextField
          label="Menstruação (dias)"
          value={form.periodDays}
          onChange={(v) => {
            setForm((f) => ({ ...f, periodDays: v.replace(/\D/g, '') }))
            setErrors((er) => ({ ...er, periodDays: undefined }))
          }}
          error={errors.periodDays}
          inputMode="numeric"
          maxLength={2}
          data
          testId="period-days"
        />
      </div>
      <p className="text-[13px] text-muted">
        Com 2 ciclos registrados o app passa a usar a sua média real. Não sabe? Deixe 28 e 5.
      </p>
    </form>
  )
}
