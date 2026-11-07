import { CircleCheck, CircleDashed, Clock, HeartHandshake, LoaderCircle, Pencil, SkipForward, SquareX, type LucideIcon } from 'lucide-react'
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

/** Título bicolor ARQ-E: âncora da ação em ink + complemento em muted, na mesma frase */
export function Title({
  anchor,
  rest,
  as: Tag = 'h1',
  size = 'lg',
  id,
}: {
  anchor: string
  rest?: string
  as?: 'h1' | 'h2' | 'h3'
  size?: 'xl' | 'lg' | 'md' | 'sm'
  id?: string
}) {
  const sizes = {
    xl: 'text-[28px] leading-[1.15] sm:text-[34px]',
    lg: 'text-[22px] leading-tight sm:text-[26px]',
    md: 'text-[18px] leading-snug',
    sm: 'text-[15px] leading-snug',
  }
  return (
    <Tag id={id} className={cx('font-bold tracking-tight text-ink', sizes[size])}>
      {anchor}
      {rest ? <span className="text-muted"> {rest}</span> : null}
    </Tag>
  )
}

export type StatusKind = 'ok' | 'pending' | 'snooze' | 'late' | 'sos' | 'skipped'

const STATUS: Record<StatusKind, { icon: LucideIcon; cls: string }> = {
  ok: { icon: CircleCheck, cls: 'text-ok border-ok bg-ok-soft border-solid' },
  pending: { icon: CircleDashed, cls: 'text-warn border-warn bg-warn-soft border-dashed' },
  snooze: { icon: Clock, cls: 'text-warn border-warn bg-warn-soft border-dashed' },
  late: { icon: SquareX, cls: 'text-err border-err bg-err-soft border-solid' },
  sos: { icon: HeartHandshake, cls: 'text-err border-err bg-err-soft border-solid' },
  skipped: { icon: SkipForward, cls: 'text-muted border-line-strong bg-subtle border-solid' },
}

/** Estado = forma (ícone) + texto + cor + traço */
export function StatusBadge({ kind, children, className }: { kind: StatusKind; children: ReactNode; className?: string }) {
  const { icon: Icon, cls } = STATUS[kind]
  return (
    <span
      data-status={kind}
      className={cx('inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[13px] font-semibold', cls, className)}
    >
      <Icon size={15} strokeWidth={2.4} aria-hidden className="shrink-0" />
      <span className="tabular min-w-0 break-words">{children}</span>
    </span>
  )
}

/** Grupo de seleção (rádio) que troca na hora, sem transição de cor */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  stretch,
  fill,
  hideLabel = true,
}: {
  label: string
  value: T
  /** shortLabel aparece abaixo de 640px, quando o rótulo longo não cabe */
  options: { value: T; label: ReactNode; shortLabel?: ReactNode; icon?: LucideIcon; testId?: string; ariaLabel?: string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  /** seletor de página: colunas iguais na largura toda até o tablet; no computador (com barra lateral), largura natural */
  stretch?: boolean
  /** colunas iguais ocupando toda a largura em qualquer tela (barra lateral, cartões estreitos) */
  fill?: boolean
  hideLabel?: boolean
}) {
  const id = useId()
  const move = (from: number, dir: 1 | -1, el: HTMLElement) => {
    const next = options[(from + dir + options.length) % options.length]
    if (!next) return
    onChange(next.value)
    const radios = el.parentElement?.querySelectorAll<HTMLButtonElement>('[role=radio]')
    radios?.[(from + dir + options.length) % options.length]?.focus()
  }
  return (
    <div className={fill ? 'w-full' : stretch ? 'w-full lg:w-auto' : 'max-w-full'}>
      <span id={id} className={hideLabel ? 'sr-only' : 'mb-1.5 block text-[13px] font-semibold text-muted'}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        // stretch: colunas iguais até o tablet; no computador cada opção tem a largura natural do rótulo completo
        className={cx(
          'gap-1 rounded-[16px] bg-subtle p-1',
          fill ? 'grid w-full auto-cols-fr grid-flow-col' : stretch ? 'grid w-full auto-cols-fr grid-flow-col lg:inline-flex lg:w-auto' : 'inline-flex max-w-full',
        )}
      >
        {options.map((o, i) => {
          const active = o.value === value
          // divisória fina entre duas opções não selecionadas: cada opção se lê como opção
          const divider = i > 0 && !active && options[i - 1]?.value !== value
          const Icon = o.icon
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={o.ariaLabel}
              tabIndex={active ? 0 : -1}
              data-testid={o.testId}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  move(i, 1, e.currentTarget)
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  move(i, -1, e.currentTarget)
                }
              }}
              className={cx(
                'press inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[12px] font-semibold whitespace-nowrap',
                size === 'sm' ? 'min-h-11 px-2.5 text-[13px]' : 'min-h-11 px-3 text-[14px]',
                fill ? 'px-1.5' : stretch ? 'lg:shrink-0' : 'shrink',
                active ? 'bg-segment-active text-ink shadow-card ring-1 ring-line-strong' : 'text-muted',
                divider && 'relative before:absolute before:top-1/4 before:-left-[2.5px] before:h-1/2 before:w-px before:bg-line-strong',
              )}
            >
              {Icon ? <Icon size={16} aria-hidden className="shrink-0" /> : null}
              {o.shortLabel ? (
                <>
                  <span className="truncate sm:hidden">{o.shortLabel}</span>
                  <span className="hidden truncate sm:inline">{o.label}</span>
                </>
              ) : (
                <span className="truncate">{o.label}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Pílulas de escolha (formulários). Alvo mínimo 48px. */
export function ChoiceChips<T extends string>({
  label,
  value,
  options,
  onChange,
  error,
  stack = false,
  cols = 2,
}: {
  label: string
  value: T | null
  options: { value: T; label: ReactNode; icon?: LucideIcon; hint?: string; testId?: string }[]
  onChange: (v: T) => void
  error?: string
  /** uma opção por linha, na largura toda (cartões de Ajustes, rótulos com nomes) */
  stack?: boolean
  /** colunas iguais na largura toda; a última opção de uma conta ímpar ocupa a linha */
  cols?: 1 | 2 | 3
}) {
  const id = useId()
  const n = stack ? 1 : Math.min(cols, options.length)
  const grid = n === 1 ? 'grid-cols-1' : n === 2 ? 'grid-cols-2' : 'grid-cols-3'
  const odd = n === 2 && options.length % 2 === 1
  return (
    <fieldset className="min-w-0">
      <legend id={id} className="mb-2 text-[14px] font-semibold text-ink">
        {label}
      </legend>
      <div role="radiogroup" aria-labelledby={id} aria-invalid={error ? true : undefined} className={cx('grid gap-2', grid)}>
        {options.map((o, i) => {
          const active = o.value === value
          const Icon = o.icon
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={o.testId}
              onClick={() => onChange(o.value)}
              className={cx(
                'press flex min-h-12 w-full min-w-0 items-center gap-2 rounded-[14px] border px-3.5 py-2 text-left text-[14px] leading-snug font-semibold',
                odd && i === options.length - 1 && 'col-span-2',
                active ? 'border-action bg-selected text-ink' : 'border-line bg-surface text-ink hoverable',
              )}
            >
              {Icon ? <Icon size={18} aria-hidden className={cx('shrink-0', active ? 'text-action' : 'text-muted')} /> : null}
              <span className="min-w-0 break-words">
                {o.label}
                {o.hint ? <span className="block text-[12px] font-medium text-muted">{o.hint}</span> : null}
              </span>
            </button>
          )
        })}
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </fieldset>
  )
}

/** Campo de texto padrão dos formulários: label acima, fonte 16px, alvo de 56px, erro inline acessível */
export function TextField({
  label,
  optional,
  value,
  onChange,
  error,
  hint,
  type = 'text',
  inputMode,
  placeholder,
  maxLength,
  testId,
  autoFocus,
  data,
  className,
}: {
  label: ReactNode
  optional?: boolean
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: ReactNode
  type?: 'text' | 'time' | 'date'
  inputMode?: 'text' | 'numeric'
  placeholder?: string
  maxLength?: number
  testId?: string
  autoFocus?: boolean
  /** valores, horários e datas em fonte de dados (tabular) */
  data?: boolean
  className?: string
}) {
  const id = useId()
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={id} className="mb-2 block text-[14px] font-semibold text-ink">
        {label}
        {optional ? <span className="font-medium text-muted"> (opcional)</span> : null}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        data-testid={testId}
        data-autofocus={autoFocus ? true : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          'min-h-14 w-full min-w-0 rounded-[16px] border bg-bg px-4 text-[16px] text-ink placeholder:text-muted',
          data && 'font-data',
          error ? 'border-err' : 'border-line-strong',
        )}
      />
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

export function FieldError({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-err">
      <SquareX size={15} aria-hidden />
      {children}
    </p>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  testId,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  description?: ReactNode
  testId?: string
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <span id={id} className="block text-[15px] font-semibold text-ink">
          {label}
        </span>
        {description ? <span className="mt-0.5 block text-[13px] text-muted">{description}</span> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className="press relative mt-0.5 inline-flex h-12 w-[68px] shrink-0 items-center"
      >
        <span className={cx('absolute inset-x-0 top-2 h-8 rounded-full border', checked ? 'border-action bg-action' : 'border-line-strong bg-subtle')} />
        <span
          aria-hidden
          className={cx(
            'absolute top-3 h-6 w-6 rounded-full shadow-card transition-transform duration-150',
            checked ? 'translate-x-[38px] bg-on-action' : 'translate-x-[4px] bg-muted',
          )}
        />
        <span className="sr-only">{checked ? 'Ativado' : 'Desativado'}</span>
      </button>
    </div>
  )
}

/**
 * Botão padrão. `busy`: trabalhando (salvando, conectando). Mantém rótulo e largura, troca o ícone por um
 * indicador que gira (parado com movimento reduzido), anuncia aria-busy e não fica "apagado" como desabilitado.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  busy = false,
  block = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'quiet'
  size?: 'sm' | 'md' | 'compact' | 'lg'
  icon?: LucideIcon
  busy?: boolean
  /** largura toda do cartão; o rótulo quebra em vez de vazar (nomes longos) */
  block?: boolean
}) {
  const variants = {
    primary: 'btn-primary',
    secondary: 'border border-line-strong bg-surface text-ink hoverable',
    ghost: 'text-action hoverable',
    quiet: 'bg-subtle text-ink hoverable',
  }
  const sizes = {
    sm: 'min-h-11 px-3.5 text-[14px] rounded-[14px]',
    md: 'min-h-12 px-4 text-[15px] rounded-[16px]',
    /** alvo de 48px com menos respiro lateral, para dois botões lado a lado no celular */
    compact: 'min-h-12 px-3 text-[14px] rounded-[16px]',
    lg: 'min-h-14 px-5 text-[16px] rounded-[18px]',
  }
  const iconSize = size === 'lg' ? 20 : 18
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'press inline-flex items-center justify-center gap-2 font-semibold',
        block ? 'w-full py-2 text-center leading-snug' : 'whitespace-nowrap',
        busy ? 'cursor-progress' : 'disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {busy ? <LoaderCircle size={iconSize} aria-hidden className="shrink-0 motion-safe:animate-spin" /> : Icon ? <Icon size={iconSize} aria-hidden className="shrink-0" /> : null}
      {block ? <span className="min-w-0 break-words">{children}</span> : children}
    </button>
  )
}

/** Frase com valores em reais: "R$" nunca fica no fim de uma linha com o número na de baixo */
export function MoneyText({ children }: { children: string }) {
  const parts = children.split(/(R\$\s?\d[\d.]*(?:,\d{2})?)/)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="whitespace-nowrap">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  )
}

/** Botão de ícone "Editar" (44px), com nome acessível dizendo o que edita */
export function EditButton({ label, onClick, testId }: { label: string; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
      className="press hoverable inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted"
    >
      <Pencil size={18} aria-hidden />
    </button>
  )
}

/** Marca de pessoa/escopo: cor + texto, nunca só cor */
export function OwnerTag({ tone, children }: { tone: 'a' | 'b' | 'us'; children: ReactNode }) {
  const map = { a: 'text-partner-a', b: 'text-partner-b', us: 'text-couple' }
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[12px] font-semibold', map[tone])}>
      <span aria-hidden className="h-2 w-2 rounded-full bg-current" />
      <span>{children}</span>
    </span>
  )
}

/** Ações de um cartão: uma por linha, na largura toda (use com <Button block>) */
export function Actions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mt-4 flex flex-col gap-2', className)}>{children}</div>
}

export function SectionHeader({ title, rest, action, id }: { title: string; rest?: string; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
      <Title as="h2" size="md" anchor={title} rest={rest} id={id} />
      {/* no celular a ação desce para a largura toda; no computador fica ao lado do título */}
      {action ? <div className="w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto">{action}</div> : null}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[20px] border border-dashed border-line-strong px-5 py-8 text-center">
      <Icon size={28} className="text-action" aria-hidden />
      <p className="mt-3 text-[16px] font-bold text-ink">{title}</p>
      <p className="mt-1 max-w-[34ch] text-[14px] text-muted">{text}</p>
      {action ? <div className="mt-4 w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto">{action}</div> : null}
    </div>
  )
}
