import { Plus, Trash2, X } from 'lucide-react'
import { useId } from 'react'
import { Button, cx, FieldError } from '../../components/ui'
import { MAX_TIMES } from '../../domain/catalog'

/** Um ou mais horários (HH:MM). Cada campo tem alvo de 56px; remover e adicionar têm 48px. */
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
            <input
              type="time"
              value={t}
              aria-label={times.length > 1 ? `Horário ${i + 1}` : 'Horário'}
              aria-invalid={error ? true : undefined}
              data-testid={`${testId}-${i}`}
              onChange={(e) => onChange(times.map((x, j) => (j === i ? e.target.value : x)))}
              className={cx(
                'font-data min-h-14 w-full max-w-[200px] min-w-0 rounded-[16px] border bg-bg px-4 text-[16px] text-ink',
                error ? 'border-err' : 'border-line-strong',
              )}
            />
            {times.length > 1 ? (
              <button
                type="button"
                onClick={() => onChange(times.filter((_, j) => j !== i))}
                aria-label={`Remover o horário ${t || i + 1}`}
                className="press hoverable inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-muted"
              >
                <X size={18} aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {times.length < MAX_TIMES ? (
        <Button size="sm" variant="ghost" icon={Plus} className="mt-1 -ml-2" onClick={() => onChange([...times, next()])} data-testid={`${testId}-add`}>
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
