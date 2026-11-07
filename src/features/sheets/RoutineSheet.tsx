import { firstName } from '../../domain/format'
import { User, UserRound, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ChoiceChips, cx, TextField } from '../../components/ui'
import { hasErrors, routineToInput, validateRoutine, weekdaysPreset, type RoutineInput, type RoutineResponsible } from '../../domain/catalog'
import { deleteMedication, saveRoutine } from '../../store/actions'
import { dataStore } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { DeleteButton, TimesField } from './fields'
import { SHEET_FORM } from './forms'

type DaysPreset = 'EVERY' | 'WEEKDAYS' | 'WEEKEND' | 'CUSTOM'
const PRESET_DAYS: Record<Exclude<DaysPreset, 'CUSTOM'>, number[]> = { EVERY: [], WEEKDAYS: [1, 2, 3, 4, 5], WEEKEND: [0, 6] }
const WEEK = [
  { d: 0, short: 'D', long: 'domingo' },
  { d: 1, short: 'S', long: 'segunda' },
  { d: 2, short: 'T', long: 'terça' },
  { d: 3, short: 'Q', long: 'quarta' },
  { d: 4, short: 'Q', long: 'quinta' },
  { d: 5, short: 'S', long: 'sexta' },
  { d: 6, short: 'S', long: 'sábado' },
]

/** Nova rotina da casa, ou edição quando recebe `id` (qualquer um dos dois edita) */
export function RoutineSheet({ id, onDone }: { id?: string; onDone: () => void }) {
  const { partner, viewer } = usePeople()
  const [form, setForm] = useState<RoutineInput>(() => {
    const prev = id ? dataStore.get().meds[id] : undefined
    return prev ? routineToInput(prev, viewer) : { title: '', times: ['20:00'], weekdays: [], instruction: '', responsible: 'ANY', stock: '', stockUnit: 'unidades' }
  })
  const [preset, setPreset] = useState<DaysPreset>(() => weekdaysPreset(form.weekdays))
  const [errors, setErrors] = useState<ReturnType<typeof validateRoutine>>({})
  const [daysError, setDaysError] = useState<string | null>(null)
  const set = <K extends keyof RoutineInput>(k: K) => (v: RoutineInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const choosePreset = (p: DaysPreset) => {
    setPreset(p)
    setDaysError(null)
    if (p !== 'CUSTOM') set('weekdays')(PRESET_DAYS[p])
  }
  const toggleDay = (d: number) => {
    setDaysError(null)
    set('weekdays')(form.weekdays.includes(d) ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d])
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next = validateRoutine(form)
    setErrors(next)
    const noDays = preset === 'CUSTOM' && form.weekdays.length === 0
    setDaysError(noDays ? 'Escolha pelo menos um dia.' : null)
    if (hasErrors(next) || noDays) return
    if (saveRoutine(form, id)) onDone()
  }

  return (
    <form id={SHEET_FORM.routine} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <TextField label="Título da rotina" value={form.title} onChange={set('title')} error={errors.title} placeholder="Ex.: Remédio do gato" maxLength={60} testId="routine-title" autoFocus={!id} />
      <TimesField times={form.times} onChange={set('times')} error={errors.times} testId="routine-time" />

      <div>
        <ChoiceChips<DaysPreset>
          label="Dias"
          value={preset}
          onChange={choosePreset}
          options={[
            { value: 'EVERY', label: 'Todo dia' },
            { value: 'WEEKDAYS', label: 'Dias úteis' },
            { value: 'WEEKEND', label: 'Fim de semana' },
            { value: 'CUSTOM', label: 'Escolher dias' },
          ]}
        />
        {preset === 'CUSTOM' ? (
          <div role="group" aria-label="Dias da semana" className="mt-3 grid grid-cols-7 gap-1" data-testid="routine-days">
            {WEEK.map((w) => {
              const on = form.weekdays.includes(w.d)
              return (
                <button
                  key={w.d}
                  type="button"
                  aria-pressed={on}
                  aria-label={w.long}
                  onClick={() => toggleDay(w.d)}
                  className={cx('press min-h-12 rounded-[12px] border text-[14px] font-bold', on ? 'border-action bg-selected text-action' : 'border-line bg-surface text-ink hoverable')}
                >
                  {w.short}
                </button>
              )
            })}
          </div>
        ) : null}
        {daysError ? (
          <p role="alert" className="mt-1.5 text-[13px] font-semibold text-err">
            {daysError}
          </p>
        ) : null}
      </div>

      <TextField
        label="Instrução"
        optional
        value={form.instruction}
        onChange={set('instruction')}
        placeholder="Ex.: meio comprimido na ração"
        maxLength={80}
        testId="routine-instruction"
      />

      <ChoiceChips<RoutineResponsible>
        label="Responsável"
        value={form.responsible}
        onChange={set('responsible')}
        options={[
          { value: 'ANY', label: 'Qualquer um', icon: Users },
          { value: 'ME', label: 'Meu', icon: User },
          { value: 'PARTNER', label: `De ${firstName(partner.displayName)}`, icon: UserRound },
        ]}
      />

      <div className="grid grid-cols-1 gap-5 min-[400px]:grid-cols-2">
        <TextField
          label="Estoque"
          optional
          inputMode="numeric"
          data
          value={form.stock}
          onChange={(v) => set('stock')(v.replace(/[^\d]/g, '').slice(0, 4))}
          error={errors.stock}
          placeholder="Ex.: 14"
          testId="routine-stock"
        />
        <TextField label="Unidade" value={form.stockUnit} onChange={set('stockUnit')} placeholder="unidades" maxLength={20} testId="routine-unit" />
      </div>
      <p className="-mt-3 text-[13px] text-muted">Qualquer um de vocês confirma a rotina. O responsável é só um combinado.</p>
      {id ? <DeleteButton label="Excluir rotina" testId="routine-delete" onClick={() => deleteMedication(id) && onDone()} /> : null}
    </form>
  )
}
