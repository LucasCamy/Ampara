import { Cake, Heart, Star } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { DateField } from '../../components/pickers'
import { ChoiceChips, TextField } from '../../components/ui'
import { hasErrors, isDateKey } from '../../domain/catalog'
import { toDateKey } from '../../domain/dates'
import { validateSpecialDate, type SpecialDateInput } from '../../domain/specialDates'
import type { PartnerId, SpecialDateKind } from '../../domain/types'
import { useNow } from '../../store/clock'
import { dataStore } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { deleteSpecialDate, saveSpecialDate } from '../../store/specialActions'
import { DeleteButton } from './fields'
import { SHEET_FORM } from './forms'

export function SpecialDateSheet({ id, onDone }: { id?: string; onDone: () => void }) {
  const today = toDateKey(useNow())
  const { viewer, partnerId, profiles } = usePeople()
  const [form, setForm] = useState<SpecialDateInput>(() => {
    const prev = id ? dataStore.get().specialDates[id] : undefined
    return prev
      ? { title: prev.kind === 'OTHER' ? prev.title : '', date: prev.date, kind: prev.kind, personId: prev.personId }
      : { title: '', date: '', kind: 'ANNIVERSARY', personId: partnerId }
  })
  const [errors, setErrors] = useState<ReturnType<typeof validateSpecialDate>>({})
  const set = <K extends keyof SpecialDateInput>(k: K) => (v: SpecialDateInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }
  const first = (p: PartnerId) => profiles[p].displayName.split(' ')[0]!

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next = validateSpecialDate(form, today, isDateKey)
    setErrors(next)
    if (hasErrors(next)) return
    if (saveSpecialDate(form, id)) onDone()
  }

  return (
    <form id={SHEET_FORM.specialDate} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <ChoiceChips<SpecialDateKind>
        label="O que é"
        value={form.kind}
        onChange={set('kind')}
        options={[
          { value: 'ANNIVERSARY', label: 'Namoro', icon: Heart, hint: 'aniversário do casal' },
          { value: 'BIRTHDAY', label: 'Aniversário', icon: Cake },
          { value: 'OTHER', label: 'Outra data', icon: Star },
        ]}
      />
      {form.kind === 'BIRTHDAY' ? (
        <ChoiceChips<PartnerId>
          label="De quem"
          value={form.personId}
          onChange={set('personId')}
          options={[
            { value: partnerId, label: first(partnerId) },
            { value: viewer, label: `${first(viewer)} (você)` },
          ]}
        />
      ) : null}
      {form.kind === 'OTHER' ? (
        <TextField label="Nome da data" value={form.title} onChange={set('title')} error={errors.title} placeholder="Ex.: Primeiro encontro" maxLength={60} testId="special-title" />
      ) : null}
      <DateField label="Data original (o ano conta quantos anos faz)" value={form.date} onChange={set('date')} error={errors.date} testId="special-date" past />
      {id ? <DeleteButton label="Excluir data" testId="special-delete" onClick={() => deleteSpecialDate(id) && onDone()} /> : null}
    </form>
  )
}
