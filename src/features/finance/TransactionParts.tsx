import { Layers, MoreHorizontal, Repeat } from 'lucide-react'
import { CATEGORIES } from '../../components/categories'
import { StatusBadge } from '../../components/ui'
import { formatCents } from '../../domain/format'
import { daysOverdue, isOverdue, txBadge } from '../../domain/ledger'
import type { Transaction } from '../../domain/types'
import { ui } from '../../store/ui'

export function TxHeader({ tx, masked, readOnly }: { tx: Transaction; masked?: boolean; readOnly?: boolean }) {
  const C = CATEGORIES[tx.category]
  return (
    <div className="-mt-1 -mr-1 flex items-start justify-between gap-2">
      <p className="flex min-w-0 items-center gap-2 pt-1 text-[15px] font-semibold text-ink">
        <C.icon size={18} aria-hidden className="shrink-0 text-muted" />
        <span className="truncate">{masked ? 'Item reservado' : tx.description}</span>
      </p>
      <span className="flex shrink-0 items-center">
        <span className="font-data pt-1 text-[15px] font-semibold whitespace-nowrap text-ink">{formatCents(tx.amountCents)}</span>
        {!readOnly && !masked && tx.type === 'EXPENSE' ? (
          <button
            type="button"
            onClick={() => ui.openSheet('tx', { id: tx.id })}
            aria-label={`Detalhes de ${tx.description}`}
            data-testid="tx-open"
            className="press hoverable inline-flex h-11 w-11 items-center justify-center rounded-full text-muted"
          >
            <MoreHorizontal size={18} aria-hidden />
          </button>
        ) : null}
      </span>
    </div>
  )
}

const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`

/** O mesmo vencimento em Finanças e no painel pessoal, com texto e traço de estado. */
export function DueBadge({ tx, today }: { tx: Transaction; today: string }) {
  if (isOverdue(tx, today)) {
    const n = daysOverdue(tx, today)
    return <StatusBadge kind="late">Vencida há <span className="font-data">{n}</span> {n === 1 ? 'dia' : 'dias'} (<span className="font-data">{ddmm(tx.competenceDate)}</span>)</StatusBadge>
  }
  return <StatusBadge kind="pending">{tx.competenceDate === today ? 'Vence hoje' : <>Vence <span className="font-data">{ddmm(tx.competenceDate)}</span></>}</StatusBadge>
}

/** Parcela e conta fixa: ícone + texto; a data da baixa não muda a competência. */
export function SeriesTag({ tx }: { tx: Transaction }) {
  const label = txBadge(tx)
  if (!label && !tx.paidAt) return null
  const Icon = tx.recurrenceId ? Repeat : Layers
  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-x-3 text-[12px] font-semibold text-couple">
      {label ? (
        <span className="inline-flex items-center gap-1" data-testid="series-tag">
          <Icon size={13} aria-hidden /> <span className="font-data">{label}</span>
        </span>
      ) : null}
      {tx.status === 'CONFIRMED_SOLID' && tx.paidAt && tx.paidAt !== tx.competenceDate ? (
        <span className="font-medium text-muted">pago em <span className="font-data">{ddmm(tx.paidAt)}</span></span>
      ) : null}
    </span>
  )
}
