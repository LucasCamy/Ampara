import { useState, type FormEvent } from 'react'
import { DateField } from '../../components/pickers'
import { Switch } from '../../components/ui'
import { logsOf, validatePeriod, type PeriodInput } from '../../domain/cycle'
import { hasErrors, isDateKey } from '../../domain/catalog'
import { toDateKey } from '../../domain/dates'
import { deletePeriod, savePeriod } from '../../store/cycleActions'
import { useNow } from '../../store/clock'
import { dataStore } from '../../store/data'
import { uiStore } from '../../store/ui'
import { DeleteButton } from './fields'
import { SHEET_FORM } from './forms'

/** Registrar o início da menstruação (ou corrigir um registro, com params.id) */
export function PeriodSheet({ id, onDone }: { id?: string; onDone: () => void }) {
  const today = toDateKey(useNow())
  const [form, setForm] = useState<PeriodInput>(() => {
    const prev = id ? dataStore.get().cycleLogs[id] : undefined
    return prev ? { startDate: prev.startDate, endDate: prev.endDate } : { startDate: today, endDate: null }
  })
  const [errors, setErrors] = useState<ReturnType<typeof validatePeriod>>({})

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const who = uiStore.get().viewer
    const others = logsOf(Object.values(dataStore.get().cycleLogs), who).filter((l) => l.id !== id)
    const next = validatePeriod(form, others, today)
    setErrors(next)
    if (hasErrors(next)) return
    if (savePeriod(form, id)) onDone()
  }

  return (
    <form id={SHEET_FORM.period} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <DateField
        label="Primeiro dia da menstruação"
        value={form.startDate}
        onChange={(v) => {
          setForm((f) => ({ ...f, startDate: v }))
          setErrors((er) => ({ ...er, startDate: undefined }))
        }}
        error={errors.startDate}
        testId="period-start"
        past
      />
      <Switch
        checked={form.endDate !== null}
        onChange={(on) => {
          setForm((f) => ({ ...f, endDate: on ? (isDateKey(f.startDate) && f.startDate > today ? f.startDate : today) : null }))
          setErrors((er) => ({ ...er, endDate: undefined }))
        }}
        testId="period-ended"
        label="Já terminou"
        description="Se ainda não terminou, deixe desligado. Dá para marcar o fim depois, com um toque."
      />
      {form.endDate !== null ? (
        <DateField
          label="Último dia"
          value={form.endDate}
          onChange={(v) => {
            setForm((f) => ({ ...f, endDate: v }))
            setErrors((er) => ({ ...er, endDate: undefined }))
          }}
          error={errors.endDate}
          testId="period-end"
          past
        />
      ) : null}
      <p className="text-[13px] text-muted">
        Fica cifrado no seu aparelho. Quem vê o quê você escolhe em Cuidados › Ciclo.
      </p>
      {id ? <DeleteButton label="Excluir registro" testId="period-delete" onClick={() => deletePeriod(id) && onDone()} /> : null}
    </form>
  )
}
