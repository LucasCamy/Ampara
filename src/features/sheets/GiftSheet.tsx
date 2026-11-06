import { useMemo, useState, type FormEvent } from 'react'
import { ChoiceChips, TextField } from '../../components/ui'
import { toDateKey } from '../../domain/dates'
import { upcomingDates } from '../../domain/specialDates'
import { useNow } from '../../store/clock'
import { dataStore, useData } from '../../store/data'
import { deleteGift, saveGift, type GiftInput } from '../../store/specialActions'
import { DeleteButton } from './fields'
import { SHEET_FORM } from './forms'

/** Ideia de presente: só quem anota vê. Pré-preenche a data quando vem de uma data especial. */
export function GiftSheet({ id, params, onDone }: { id?: string; params: Record<string, string>; onDone: () => void }) {
  const today = toDateKey(useNow())
  const dates = useData((s) => s.specialDates)
  const upcoming = useMemo(() => upcomingDates(Object.values(dates), today).slice(0, 4), [dates, today])
  const [form, setForm] = useState<GiftInput>(() => {
    const prev = id ? dataStore.get().giftIdeas[id] : undefined
    return prev ? { title: prev.title, note: prev.note, specialDateId: prev.specialDateId } : { title: '', note: '', specialDateId: params.dateId ?? null }
  })
  const [error, setError] = useState<string>()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('Escreva a ideia (ex.: colar com pingente de lua).')
      return
    }
    if (saveGift(form, id)) onDone()
  }

  return (
    <form id={SHEET_FORM.gift} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <TextField
        label="Ideia"
        value={form.title}
        onChange={(v) => {
          setForm((f) => ({ ...f, title: v }))
          setError(undefined)
        }}
        error={error}
        placeholder="Ex.: o livro que ela comentou"
        maxLength={80}
        testId="gift-title"
        autoFocus={!id}
      />
      <TextField
        label="Onde viu, tamanho, cor"
        optional
        value={form.note}
        onChange={(v) => setForm((f) => ({ ...f, note: v }))}
        placeholder="Ex.: vitrine da loja do shopping, prata"
        maxLength={280}
        testId="gift-note"
      />
      {upcoming.length ? (
        <ChoiceChips<string>
          label="Para qual data"
          value={form.specialDateId ?? 'NONE'}
          onChange={(v) => setForm((f) => ({ ...f, specialDateId: v === 'NONE' ? null : v }))}
          options={[{ value: 'NONE', label: 'Sem data' }, ...upcoming.map((u) => ({ value: u.item.id, label: u.item.title, hint: `${u.on.slice(8, 10)}/${u.on.slice(5, 7)}` }))]}
        />
      ) : null}
      <p className="text-[13px] text-muted">Fica só no seu aparelho e na sua conta. Seu par nunca vê.</p>
      {id ? <DeleteButton label="Excluir ideia" testId="gift-delete" onClick={() => deleteGift(id) && onDone()} /> : null}
    </form>
  )
}
