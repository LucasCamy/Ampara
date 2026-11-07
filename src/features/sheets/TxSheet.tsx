import { CircleDashed, ListX, Trash2 } from 'lucide-react'
import { CATEGORIES } from '../../components/categories'
import { Button, StatusBadge } from '../../components/ui'
import { toDateKey } from '../../domain/dates'
import { formatCents } from '../../domain/format'
import { daysOverdue, isOverdue, txBadge } from '../../domain/ledger'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { deleteTransaction, unpayTransaction } from '../../store/financeActions'
import { usePeople } from '../../store/hooks'
import { ui } from '../../store/ui'

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/** Detalhe de um lançamento: dar baixa, desfazer baixa e excluir (esta ou esta e as próximas) */
export function TxSheet({ id, onDone }: { id: string; onDone: () => void }) {
  const today = toDateKey(useNow())
  const { viewer, profiles } = usePeople()
  const tx = useData((s) => s.transactions[id])
  if (!tx) return null
  const mine = tx.scope === 'COUPLE' || tx.createdBy === viewer
  const series = !!(tx.installmentGroup || tx.recurrenceId)
  const badge = txBadge(tx)
  const C = CATEGORIES[tx.category]
  return (
    <div className="flex flex-col gap-4 pt-2 pb-2" data-testid="tx-detail">
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-[17px] font-bold text-ink">
          <C.icon size={20} aria-hidden className="shrink-0 text-muted" />
          <span className="break-words">{tx.description}</span>
        </p>
        <span className="font-data shrink-0 text-[17px] font-semibold whitespace-nowrap text-ink">{formatCents(tx.amountCents)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        {tx.status === 'CONFIRMED_SOLID' ? (
          <StatusBadge kind="ok">Pago{tx.paidAt ? ` em ${ddmm(tx.paidAt)}` : ''}</StatusBadge>
        ) : isOverdue(tx, today) ? (
          <StatusBadge kind="late">Vencida há {daysOverdue(tx, today)} {daysOverdue(tx, today) === 1 ? 'dia' : 'dias'}</StatusBadge>
        ) : (
          <StatusBadge kind="pending">Previsto · vence {ddmm(tx.competenceDate)}</StatusBadge>
        )}
        {badge ? <span className="font-semibold text-couple">{badge}</span> : null}
        <span>
          {tx.scope === 'COUPLE' ? 'Do casal' : 'Pessoal'} · competência <span className="font-data">{ddmm(tx.competenceDate)}</span>
          {tx.status === 'CONFIRMED_SOLID' ? ` · pago por ${tx.paidBy === viewer ? 'você' : profiles[tx.paidBy].displayName}` : ''}
        </span>
      </div>

      {mine && tx.type === 'EXPENSE' ? (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          {tx.status === 'PREDICTED_DASHED' ? (
            <Button variant="primary" onClick={() => ui.openSheet('pay', { id })} data-testid="tx-pay">
              Dar baixa
            </Button>
          ) : (
            <Button variant="secondary" icon={CircleDashed} onClick={() => unpayTransaction(id) && onDone()} data-testid="tx-unpay">
              Desfazer baixa (voltar para previsto)
            </Button>
          )}
          <Button variant="secondary" icon={Trash2} className="border-err text-err" onClick={() => deleteTransaction(id, 'ONE') && onDone()} data-testid="tx-delete">
            {series ? (tx.recurrenceId ? 'Excluir só este mês' : 'Excluir só esta parcela') : 'Excluir lançamento'}
          </Button>
          {series ? (
            <Button variant="ghost" icon={ListX} className="text-err" onClick={() => deleteTransaction(id, 'FOLLOWING') && onDone()} data-testid="tx-delete-following">
              {tx.recurrenceId ? 'Excluir este e encerrar a conta fixa' : 'Excluir esta e as próximas parcelas'}
            </Button>
          ) : null}
          {series ? <p className="text-[13px] text-muted">As já pagas ficam no histórico. Tudo tem Desfazer.</p> : null}
        </div>
      ) : (
        <p className="text-[13px] text-muted">Somente leitura.</p>
      )}
    </div>
  )
}
