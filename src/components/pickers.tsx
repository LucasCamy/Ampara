import { CalendarDays, Clock } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { dateShortcuts, longDateLabel, toDateKey, TIME_SHORTCUTS } from '../domain/dates'
import { isDateKey, isTimeKey } from '../domain/catalog'
import { useNow } from '../store/clock'
import { cx, FieldError } from './ui'

export type Shortcut = { value: string; label: string; ariaLabel?: string; testId?: string }

/**
 * Atalhos em chips abaixo do campo: preenchem sem abrir o seletor.
 * O ativo troca sem transição (anti-flick); alvo de 44px como os demais controles compactos.
 */
export function QuickChips({
  label,
  items,
  value,
  onPick,
  testId,
  data = true,
}: {
  label: string
  items: Shortcut[]
  value: string
  onPick: (v: string) => void
  testId?: string
  /** horários e durações em fonte de dados; palavras (Hoje, Amanhã) na fonte da interface */
  data?: boolean
}) {
  return (
    <div role="group" aria-label={label} className="mt-2 flex flex-wrap gap-2" data-testid={testId}>
      {items.map((s) => {
        const active = s.value === value
        return (
          <button
            key={s.label}
            type="button"
            aria-pressed={active}
            aria-label={s.ariaLabel}
            data-testid={s.testId}
            onClick={() => onPick(s.value)}
            className={cx(
              'press inline-flex min-h-11 items-center rounded-full border px-3.5 text-[14px] font-semibold whitespace-nowrap',
              data && 'font-data',
              active ? 'border-action bg-selected text-ink' : 'hoverable border-line bg-surface text-muted',
            )}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

/** Caixa do campo de data/hora: mesma moldura do TextField, valor em fonte de dados, ícone Lucide à direita */
export function PickerInput({
  id,
  type,
  value,
  onChange,
  invalid,
  describedBy,
  ariaLabel,
  testId,
  onFocus,
  className,
}: {
  id?: string
  type: 'date' | 'time'
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  describedBy?: string
  ariaLabel?: string
  testId?: string
  onFocus?: () => void
  className?: string
}) {
  const Icon = type === 'date' ? CalendarDays : Clock
  return (
    <div className={cx('relative min-w-0', className)}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        aria-label={ariaLabel}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        data-testid={testId}
        className={cx(
          'picker-input font-data min-h-14 w-full min-w-0 rounded-[16px] border bg-bg pr-12 pl-4 text-[16px] text-ink',
          invalid ? 'border-err' : 'border-line-strong',
        )}
      />
      <Icon size={20} aria-hidden className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted" />
    </div>
  )
}

function FieldShell({
  id,
  label,
  error,
  hint,
  children,
  className,
}: {
  id: string
  label: ReactNode
  error?: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={id} className="mb-2 block text-[14px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <FieldError id={`${id}-err`}>{error}</FieldError>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** Data com atalhos Hoje / Amanhã / próximo sábado e o dia por extenso como dica */
export function DateField({
  label,
  value,
  onChange,
  error,
  testId,
  className,
}: {
  label: ReactNode
  value: string
  onChange: (v: string) => void
  error?: string
  testId: string
  className?: string
}) {
  const id = useId()
  const today = toDateKey(useNow())
  const hint = isDateKey(value) ? longDateLabel(value) : undefined
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      <PickerInput
        id={id}
        type="date"
        value={value}
        onChange={onChange}
        invalid={!!error}
        describedBy={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        testId={testId}
        className="max-w-[260px]"
      />
      <QuickChips
        label="Atalhos de data"
        value={value}
        onPick={onChange}
        testId={`${testId}-shortcuts`}
        items={dateShortcuts(today)}
        data={false}
      />
    </FieldShell>
  )
}

/** Horário com atalhos (horários comuns ou durações a partir do início) */
export function TimeField({
  label,
  value,
  onChange,
  error,
  testId,
  shortcuts,
  shortcutsLabel = 'Horários sugeridos',
  className,
}: {
  label: ReactNode
  value: string
  onChange: (v: string) => void
  error?: string
  testId: string
  shortcuts?: Shortcut[]
  shortcutsLabel?: string
  className?: string
}) {
  const id = useId()
  const items = shortcuts ?? TIME_SHORTCUTS.map((t) => ({ value: t, label: t }))
  return (
    <FieldShell id={id} label={label} error={error} className={className}>
      <PickerInput id={id} type="time" value={value} onChange={onChange} invalid={!!error} describedBy={error ? `${id}-err` : undefined} testId={testId} />
      <QuickChips label={shortcutsLabel} value={isTimeKey(value) ? value : ''} onPick={onChange} items={items} testId={`${testId}-shortcuts`} />
    </FieldShell>
  )
}
