import { BatteryLow, CloudLightning, DoorOpen, HeartHandshake, Plus, Smile, X, type LucideIcon } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Button, cx, FieldError, SectionHeader } from '../../components/ui'
import { toDateKey } from '../../domain/dates'
import { checkinOf, comfortOf, MOOD_LABEL, MOOD_PARTNER_HINT, MOODS, needsComfort } from '../../domain/mood'
import type { Mood, PartnerId } from '../../domain/types'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { addComfort, removeComfort, setMood, setMoodNote } from '../../store/moodActions'

export const MOOD_ICON: Record<Mood, LucideIcon> = {
  GOOD: Smile,
  LOW_ENERGY: BatteryLow,
  NEED_CARE: HeartHandshake,
  NEED_SPACE: DoorOpen,
  OVERWHELMED: CloudLightning,
}

const first = (name: string) => name.split(' ')[0]!

/** Cinco humores em 1 toque. Troca na hora (anti-flick). */
export function MoodPicker({ value }: { value: Mood | undefined }) {
  return (
    <div role="radiogroup" aria-label="Como você está hoje" className="flex flex-wrap gap-2">
      {MOODS.map((m) => {
        const Icon = MOOD_ICON[m]
        const active = m === value
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMood(m)}
            data-testid={`mood-${m}`}
            className={cx(
              'press inline-flex min-h-12 items-center gap-2 rounded-[14px] border px-3 text-[14px] font-semibold',
              active ? 'border-action bg-selected text-ink' : 'border-line bg-surface text-ink hoverable',
            )}
          >
            <Icon size={18} aria-hidden className={active ? 'text-action' : 'text-muted'} />
            {MOOD_LABEL[m]}
          </button>
        )
      })}
    </div>
  )
}

/** Lista "o que me acalma" de alguém, só leitura (para o par) */
export function ComfortList({ owner, title }: { owner: PartnerId; title: string }) {
  const all = useData((s) => s.comfortItems)
  const items = useMemo(() => comfortOf(Object.values(all), owner), [all, owner])
  if (!items.length) return null
  return (
    <div className="mt-3 rounded-[16px] bg-subtle p-3" data-testid="comfort-list">
      <p className="text-[13px] font-bold text-ink">{title}</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-[14px] text-ink">
        {items.map((c) => (
          <li key={c.id} className="flex gap-2">
            <span aria-hidden className="text-couple">·</span>
            <span className="min-w-0 break-words">{c.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Hoje: como o par está (e o que acalma, nos dias difíceis) */
export function PartnerMoodCard() {
  const today = toDateKey(useNow())
  const { partnerId, partner } = usePeople()
  const all = useData((s) => s.moodCheckins)
  const theirs = checkinOf(all, partnerId, today)
  const pname = first(partner.displayName)
  return theirs ? (
        <section className={cx('module p-4 sm:p-5', needsComfort(theirs.mood) ? 'ledger-solid' : 'ledger-dashed')} data-testid="partner-mood" aria-label={`Check-in de ${pname}`}>
          <p className="flex items-center gap-2 text-[13px] font-bold text-couple">
            {(() => {
              const Icon = MOOD_ICON[theirs.mood]
              return <Icon size={16} aria-hidden />
            })()}
            {pname} hoje
          </p>
          <p className="mt-2 text-[16px] font-semibold text-ink">{MOOD_LABEL[theirs.mood]}</p>
          {theirs.note ? <p className="mt-0.5 text-[14px] break-words text-ink">“{theirs.note}”</p> : null}
          <p className="mt-1 text-[14px] text-muted">{MOOD_PARTNER_HINT[theirs.mood]}</p>
          {needsComfort(theirs.mood) ? <ComfortList owner={partnerId} title={`O que costuma acalmar ${pname}`} /> : null}
        </section>
  ) : null
}

/** Hoje: meu check-in em 1 toque (o par vê) */
export function MyMoodCard() {
  const today = toDateKey(useNow())
  const { viewer, partner } = usePeople()
  const all = useData((s) => s.moodCheckins)
  const mine = checkinOf(all, viewer, today)
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  return (
    <>
      {!mine || editing ? (
        <section className="card ledger-dashed p-4" data-testid="my-mood" aria-label="Seu check-in de hoje">
          <p className="mb-3 text-[15px] font-semibold text-ink">Como você está hoje? {partner.displayName.split(' ')[0]} vê.</p>
          <MoodPicker value={mine?.mood} />
          {mine ? (
            <Button size="sm" variant="ghost" className="mt-2 -ml-2" onClick={() => setEditing(false)}>
              Pronto
            </Button>
          ) : null}
        </section>
      ) : (
        <section className="card flex flex-wrap items-center gap-x-3 gap-y-2 p-3" data-testid="my-mood-done">
          <p className="min-w-0 flex-1 text-[14px] text-muted">
            Seu check-in: <strong className="text-ink">{MOOD_LABEL[mine.mood]}</strong>
            {mine.note ? ` · “${mine.note}”` : ''}
          </p>
          <form
            className="flex w-full gap-2 sm:w-auto"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              setMoodNote(note)
              setNote('')
            }}
          >
            {!mine.note ? (
              <>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={120}
                  placeholder="Um recado curto (opcional)"
                  aria-label="Recado para o check-in"
                  data-testid="mood-note"
                  className="min-h-11 w-full min-w-0 flex-1 rounded-[14px] border border-line-strong bg-bg px-3 text-[16px] text-ink placeholder:text-muted"
                />
                <Button size="sm" variant="quiet" type="submit" disabled={!note.trim()} data-testid="mood-note-save">
                  Enviar
                </Button>
              </>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} data-testid="mood-change">
              Mudar
            </Button>
          </form>
        </section>
      )}
    </>
  )
}

/** Aba Nós: a minha lista (edito) e a do par (só leio) */
export function ComfortSection() {
  const { viewer, partnerId, partner } = usePeople()
  const all = useData((s) => s.comfortItems)
  const mine = useMemo(() => comfortOf(Object.values(all), viewer), [all, viewer])
  const [text, setText] = useState('')
  const [error, setError] = useState<string>()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const err = addComfort(text)
    setError(err)
    if (!err) setText('')
  }

  return (
    <section aria-labelledby="acalma-title" data-testid="comfort-section">
      <SectionHeader id="acalma-title" title="O que me acalma" rest={`· ${first(partner.displayName)} vê nos dias difíceis`} />
      <div className="card p-4">
        <p className="text-[14px] text-muted">
          Escreva com calma, num dia bom. Aparece para {first(partner.displayName)} quando você pede ajuda ou marca “Preciso de colo” ou “No limite”.
        </p>
        {mine.length ? (
          <ul className="mt-2 divide-y divide-line" data-testid="my-comfort">
            {mine.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-1">
                <span className="min-w-0 flex-1 text-[15px] break-words text-ink">{c.text}</span>
                <button
                  type="button"
                  onClick={() => removeComfort(c.id)}
                  aria-label={`Tirar da lista: ${c.text}`}
                  className="press hoverable inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted"
                >
                  <X size={18} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <form onSubmit={submit} className="mt-3" noValidate>
          <label htmlFor="comfort-text" className="mb-2 block text-[14px] font-semibold text-ink">
            Algo que ajuda
          </label>
          <div className="flex gap-2">
            <input
              id="comfort-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setError(undefined)
              }}
              maxLength={120}
              placeholder="Ex.: um abraço sem perguntas"
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'comfort-err' : undefined}
              data-testid="comfort-input"
              className={cx('min-h-12 w-full min-w-0 flex-1 rounded-[16px] border bg-bg px-4 text-[16px] text-ink placeholder:text-muted', error ? 'border-err' : 'border-line-strong')}
            />
            <Button type="submit" variant="quiet" icon={Plus} aria-label="Pôr na lista" data-testid="comfort-add" className="shrink-0 px-3.5" />
          </div>
          {error ? <FieldError id="comfort-err">{error}</FieldError> : null}
        </form>
      </div>
      <ComfortList owner={partnerId} title={`O que acalma ${first(partner.displayName)}`} />
    </section>
  )
}
