import { useState, type FormEvent } from 'react'
import { Switch, TextField } from '../../components/ui'
import { hasErrors, medicationToInput, validateMedication, type MedicationInput } from '../../domain/catalog'
import { deleteMedication, saveMedication } from '../../store/actions'
import { dataStore } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { DeleteButton, TimesField } from './fields'
import { SHEET_FORM } from './forms'

/** Novo remédio, ou edição quando recebe `id` (só remédios próprios) */
export function NewMedSheet({ id, onDone }: { id?: string; onDone: () => void }) {
  const { partner } = usePeople()
  const [form, setForm] = useState<MedicationInput>(() => {
    const prev = id ? dataStore.get().meds[id] : undefined
    return prev ? medicationToInput(prev) : { name: '', dosage: '', times: ['08:00'], stock: '', shareWithPartner: false }
  })
  const [errors, setErrors] = useState<ReturnType<typeof validateMedication>>({})
  const set = <K extends keyof MedicationInput>(k: K) => (v: MedicationInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next = validateMedication(form)
    setErrors(next)
    if (hasErrors(next)) return
    if (saveMedication(form, id)) onDone()
  }

  return (
    <form id={SHEET_FORM.newMed} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <TextField label="Nome do medicamento" value={form.name} onChange={set('name')} error={errors.name} placeholder="Ex.: Venvanse 30mg" maxLength={60} testId="new-med-name" autoFocus={!id} />
      <TextField label="Dose ou instrução curta" value={form.dosage} onChange={set('dosage')} error={errors.dosage} placeholder="Ex.: 1 cápsula" maxLength={60} testId="new-med-dosage" />
      <TimesField times={form.times} onChange={set('times')} error={errors.times} testId="new-med-time" />
      <TextField
        label="Estoque na caixa"
        optional
        inputMode="numeric"
        data
        value={form.stock}
        onChange={(v) => set('stock')(v.replace(/[^\d]/g, '').slice(0, 4))}
        error={errors.stock}
        hint="Unidades. Avisamos quando estiver acabando."
        placeholder="Ex.: 30"
        testId="new-med-stock"
        className="max-w-[260px]"
      />
      <div className="rounded-[20px] bg-subtle p-4">
        <Switch
          checked={form.shareWithPartner}
          onChange={set('shareWithPartner')}
          testId="new-med-share"
          label="Rede de apoio do par (+30 min)"
          description={`Se você atrasar mais de 30 min, ${partner.displayName} recebe um aviso gentil. Desligado, só você vê este remédio.`}
        />
      </div>
      {id ? <DeleteButton label="Excluir remédio" testId="new-med-delete" onClick={() => deleteMedication(id) && onDone()} /> : null}
    </form>
  )
}
