import { CalendarClock, HeartPulse, ReceiptText, User, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { DateField, TimeField } from '../../components/pickers'
import { ChoiceChips, TextField } from '../../components/ui'
import { eventToInput, hasErrors, isDateKey, isTimeKey, validateEvent, type EventInput, type EventOwner, type EventType } from '../../domain/catalog'
import { addMinutesToTime, DURATION_SHORTCUTS, minutesOf, toDateKey } from '../../domain/dates'
import { deleteEvent, saveEvent } from '../../store/actions'
import { useNow } from '../../store/clock'
import { dataStore } from '../../store/data'
import { DeleteButton } from './fields'
import { SHEET_FORM } from './forms'

const START_SHORTCUTS = ['09:00', '14:00', '19:00'].map((t) => ({ value: t, label: t }))

/** Novo compromisso (params.date vem da Agenda) ou edição quando params.id existe */
export function EventSheet({ params, onDone }: { params: Record<string, string>; onDone: () => void }) {
  const id = params.id
  // "hoje" do mesmo relógio do app que o atalho "Hoje" do DateField usa
  const today = toDateKey(useNow())
  const [form, setForm] = useState<EventInput>(() => {
    const prev = id ? dataStore.get().events[id] : undefined
    if (prev) return eventToInput(prev)
    return {
      title: params.title ?? '',
      date: params.date && isDateKey(params.date) ? params.date : today,
      start: '19:00',
      end: '20:00',
      owner: 'US',
      type: 'APPOINTMENT',
    }
  })
  const [errors, setErrors] = useState<ReturnType<typeof validateEvent>>({})
  const set = <K extends keyof EventInput>(k: K) => (v: EventInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    // mexer no início pode resolver o erro do término também
    setErrors((e) => ({ ...e, [k]: undefined, ...(k === 'start' ? { end: undefined } : {}) }))
  }

  // mudar o início leva o término junto, mantendo a duração (quando os dois são válidos)
  const setStart = (start: string) => {
    setForm((f) => {
      if (!isTimeKey(start) || !isTimeKey(f.start) || !isTimeKey(f.end)) return { ...f, start }
      const duration = minutesOf(f.end) - minutesOf(f.start)
      return { ...f, start, end: duration > 0 ? addMinutesToTime(start, duration) : f.end }
    })
    setErrors((e) => ({ ...e, start: undefined, end: undefined }))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next = validateEvent(form)
    setErrors(next)
    if (hasErrors(next)) return
    if (saveEvent(form, id)) onDone()
  }

  return (
    <form id={SHEET_FORM.event} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <TextField label="Título do compromisso" value={form.title} onChange={set('title')} error={errors.title} placeholder="Ex.: Consulta médica" maxLength={80} testId="event-title" autoFocus={!id} />
      <DateField label="Data" value={form.date} onChange={set('date')} error={errors.date} testId="event-date" />
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
        <TimeField label="Início" value={form.start} onChange={setStart} error={errors.start} testId="event-start" shortcuts={START_SHORTCUTS} />
        <TimeField
          label="Término"
          value={form.end}
          onChange={set('end')}
          error={errors.end}
          testId="event-end"
          shortcutsLabel="Duração a partir do início"
          shortcuts={
            isTimeKey(form.start)
              ? DURATION_SHORTCUTS.map((d) => {
                  const end = addMinutesToTime(form.start, d.minutes)
                  return { value: end, label: d.label, ariaLabel: `${d.label}, termina às ${end}` }
                })
              : []
          }
        />
      </div>
      <ChoiceChips<EventOwner>
        label="De quem é"
        value={form.owner}
        onChange={set('owner')}
        options={[
          { value: 'US', label: 'Nós / Casal', icon: Users },
          { value: 'ME', label: 'Meu', icon: User, hint: 'só você vê' },
        ]}
      />
      <ChoiceChips<EventType>
        label="Tipo"
        value={form.type}
        onChange={set('type')}
        options={[
          { value: 'APPOINTMENT', label: 'Compromisso', icon: CalendarClock },
          { value: 'HEALTH', label: 'Saúde / remédio', icon: HeartPulse },
          { value: 'BILL', label: 'Conta que vence', icon: ReceiptText },
        ]}
      />
      {id ? <DeleteButton label="Excluir compromisso" testId="event-delete" onClick={() => deleteEvent(id) && onDone()} /> : null}
    </form>
  )
}
