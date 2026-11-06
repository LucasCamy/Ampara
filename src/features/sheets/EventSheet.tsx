import { CalendarClock, HeartPulse, ReceiptText, User, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ChoiceChips, TextField } from '../../components/ui'
import { eventToInput, hasErrors, isDateKey, validateEvent, type EventInput, type EventOwner, type EventType } from '../../domain/catalog'
import { toDateKey } from '../../domain/dates'
import { deleteEvent, saveEvent } from '../../store/actions'
import { dataStore } from '../../store/data'
import { DeleteButton } from './fields'
import { SHEET_FORM } from './forms'

/** Novo compromisso (params.date vem da Agenda) ou edição quando params.id existe */
export function EventSheet({ params, onDone }: { params: Record<string, string>; onDone: () => void }) {
  const id = params.id
  const [form, setForm] = useState<EventInput>(() => {
    const prev = id ? dataStore.get().events[id] : undefined
    if (prev) return eventToInput(prev)
    return {
      title: params.title ?? '',
      date: params.date && isDateKey(params.date) ? params.date : toDateKey(new Date()),
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
      <TextField label="Data" type="date" data value={form.date} onChange={set('date')} error={errors.date} testId="event-date" className="max-w-[260px]" />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Início" type="time" data value={form.start} onChange={set('start')} error={errors.start} testId="event-start" />
        <TextField label="Término" type="time" data value={form.end} onChange={set('end')} error={errors.end} testId="event-end" />
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
