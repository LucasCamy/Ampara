import { firstName } from '../../domain/format'
import { useState, type FormEvent } from 'react'
import { DateField } from '../../components/pickers'
import { ChoiceChips, Switch, TextField } from '../../components/ui'
import { hasErrors, medicationToInput, validateMedication, type MedicationInput } from '../../domain/catalog'
import { toDateKey } from '../../domain/dates'
import { PACK_KINDS, type PackKind } from '../../domain/pillPack'
import { deleteMedication, saveMedication } from '../../store/actions'
import { useNow } from '../../store/clock'
import { dataStore } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { DeleteButton, TimesField } from './fields'
import { SHEET_FORM } from './forms'

/** Novo remédio, ou edição quando recebe `id` (só remédios próprios) */
export function NewMedSheet({ id, onDone }: { id?: string; onDone: () => void }) {
  const { partner } = usePeople()
  const today = toDateKey(useNow())
  const [form, setForm] = useState<MedicationInput>(() => {
    const prev = id ? dataStore.get().meds[id] : undefined
    return prev
      ? medicationToInput(prev)
      : { name: '', dosage: '', times: ['08:00'], stock: '', shareWithPartner: false, packKind: 'NONE', packStart: today }
  })
  const [errors, setErrors] = useState<ReturnType<typeof validateMedication>>({})
  const set = <K extends keyof MedicationInput>(k: K) => (v: MedicationInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }
  const isPack = !!form.packKind && form.packKind !== 'NONE'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next = validateMedication(form, today)
    setErrors(next)
    if (hasErrors(next)) return
    if (saveMedication(form, id)) onDone()
  }

  return (
    <form id={SHEET_FORM.newMed} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <TextField label="Nome do medicamento" value={form.name} onChange={set('name')} error={errors.name} placeholder="Ex.: Venvanse 30mg" maxLength={60} testId="new-med-name" autoFocus={!id} />
      <TextField label="Dose ou instrução curta" value={form.dosage} onChange={set('dosage')} error={errors.dosage} placeholder="Ex.: 1 cápsula" maxLength={60} testId="new-med-dosage" />
      <TimesField times={form.times} onChange={set('times')} error={errors.times} testId="new-med-time" />
      <div className="rounded-[20px] bg-subtle p-4">
        <Switch
          checked={isPack}
          onChange={(on) => {
            setForm((f) => ({ ...f, packKind: on ? '21_7' : 'NONE', packStart: f.packStart || today, times: on ? f.times.slice(0, 1) : f.times }))
            setErrors((er) => ({ ...er, packStart: undefined, times: undefined }))
          }}
          testId="new-med-pack"
          label="Anticoncepcional em cartela"
          description="Conta o comprimido do dia, silencia os lembretes na pausa e avisa quando começa a cartela nova."
        />
        {isPack ? (
          <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
            <ChoiceChips<PackKind>
              label="Tipo de cartela"
              value={form.packKind === 'NONE' ? null : (form.packKind ?? null)}
              onChange={set('packKind')}
              options={(Object.keys(PACK_KINDS) as PackKind[]).map((k) => ({ value: k, label: PACK_KINDS[k].label, hint: PACK_KINDS[k].hint }))}
            />
            <DateField label="1º comprimido desta cartela" value={form.packStart ?? ''} onChange={set('packStart')} error={errors.packStart} testId="new-med-pack-start" past />
          </div>
        ) : null}
      </div>
      <TextField
        label="Estoque na caixa"
        optional
        inputMode="numeric"
        data
        value={form.stock}
        onChange={(v) => set('stock')(v.replace(/[^\d]/g, '').slice(0, 4))}
        error={errors.stock}
        hint={isPack ? 'Comprimidos, somando as cartelas que você tem.' : 'Unidades. Avisamos quando estiver acabando.'}
        placeholder={isPack ? 'Ex.: 63 (3 cartelas)' : 'Ex.: 30'}
        testId="new-med-stock"
      />
      <div className="rounded-[20px] bg-subtle p-4">
        <Switch
          checked={form.shareWithPartner}
          onChange={set('shareWithPartner')}
          testId="new-med-share"
          label="Rede de apoio do par (+30 min)"
          description={`Se você atrasar mais de 30 min, ${firstName(partner.displayName)} recebe um aviso gentil. Desligado, só você vê este remédio.`}
        />
      </div>
      {id ? <DeleteButton label="Excluir remédio" testId="new-med-delete" onClick={() => deleteMedication(id) && onDone()} /> : null}
    </form>
  )
}
