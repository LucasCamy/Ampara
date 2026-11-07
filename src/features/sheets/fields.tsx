import { Plus, Trash2, X } from 'lucide-react'
import { useId, useState } from 'react'
import { PickerInput, QuickChips } from '../../components/pickers'
import { Button, FieldError } from '../../components/ui'
import { MAX_TIMES } from '../../domain/catalog'
import { TIME_SHORTCUTS } from '../../domain/dates'

/**
 * Um ou mais horários (HH:MM). Cada campo tem alvo de 56px; remover e adicionar têm 48px.
 * Os atalhos valem para o último horário em que a pessoa tocou (ou o último da lista).
 */
export function TimesField({
  label = 'Horários',
  times,
  onChange,
  error,
  testId,
}: {
  label?: string
  times: string[]
  onChange: (times: string[]) => void
  error?: string
  testId: string
}) {
  const id = useId()
  const [active, setActive] = useState<number | null>(null)
  const target = active !== null && active < times.length ? active : times.length - 1
  const setAt = (i: number, v: string) => onChange(times.map((x, j) => (j === i ? v : x)))
  const next = () => {
    const last = times[times.length - 1] ?? '08:00'
    const h = (Number(last.slice(0, 2)) + 4) % 24
    return `${String(h).padStart(2, '0')}:${last.slice(3, 5) || '00'}`
  }
  return (
    <fieldset className="min-w-0" aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="mb-2 text-[14px] font-semibold text-ink">{times.length > 1 ? label : 'Horário'}</legend>
      <ul className="flex flex-col gap-2">
        {times.map((t, i) => (
          <li key={i} className="flex items-center gap-2">
            <PickerInput
              type="time"
              value={t}
              ariaLabel={times.length > 1 ? `Horário ${i + 1}` : 'Horário'}
              invalid={!!error}
              testId={`${testId}-${i}`}
              onFocus={() => setActive(i)}
              onChange={(v) => setAt(i, v)}
              className="w-full flex-1"
            />
            {times.length > 1 ? (
              <button
                type="button"
                onClick={() => {
                  onChange(times.filter((_, j) => j !== i))
                  setActive(null)
                }}
                aria-label={`Remover o horário ${t || i + 1}`}
                className="press hoverable inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-muted"
              >
                <X size={18} aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <QuickChips
        label={times.length > 1 ? `Horários sugeridos para o horário ${target + 1}` : 'Horários sugeridos'}
        value={times[target] ?? ''}
        onPick={(v) => setAt(target, v)}
        items={TIME_SHORTCUTS.map((v) => ({ value: v, label: v }))}
        testId={`${testId}-shortcuts`}
      />
      {times.length < MAX_TIMES ? (
        <Button size="sm" variant="quiet" icon={Plus} className="mt-1 w-full" onClick={() => onChange([...times, next()])} data-testid={`${testId}-add`}>
          Outro horário
        </Button>
      ) : null}
      {error ? <FieldError id={`${id}-err`}>{error}</FieldError> : null}
    </fieldset>
  )
}

/** Excluir dentro da gaveta de edição: acontece na hora e o Toast oferece Desfazer */
export function DeleteButton({ label, onClick, testId }: { label: string; onClick: () => void; testId: string }) {
  return (
    <div className="border-t border-line pt-4">
      <Button variant="secondary" icon={Trash2} className="w-full border-err text-err sm:w-auto" onClick={onClick} data-testid={testId}>
        {label}
      </Button>
    </div>
  )
}
