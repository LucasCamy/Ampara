import { useState, type FormEvent } from 'react'
import { DateField } from '../../components/pickers'
import { ChoiceChips, FieldError } from '../../components/ui'
import { isDateKey } from '../../domain/catalog'
import { toDateKey } from '../../domain/dates'
import { formatCents } from '../../domain/format'
import { txBadge } from '../../domain/ledger'
import type { PartnerId } from '../../domain/types'
import { useNow } from '../../store/clock'
import { dataStore } from '../../store/data'
import { payTransaction } from '../../store/financeActions'
import { usePeople } from '../../store/hooks'
import { MoneyInput } from '../finance/GoalsSection'
import { SHEET_FORM } from './forms'

/** Dar baixa num previsto: valor real (pode ter vindo diferente), quem pagou e quando */
export function PaySheet({ id, onDone }: { id: string; onDone: () => void }) {
  const today = toDateKey(useNow())
  const { viewer, partnerId, partner } = usePeople()
  const tx = dataStore.get().transactions[id]
  const [cents, setCents] = useState(tx?.amountCents ?? 0)
  const [paidBy, setPaidBy] = useState<PartnerId>(viewer)
  const [paidAt, setPaidAt] = useState(today)
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({})
  if (!tx) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next = { amount: cents > 0 ? undefined : 'Informe o valor pago.', date: isDateKey(paidAt) ? (paidAt > today ? 'A data do pagamento não pode ser no futuro.' : undefined) : 'Informe a data.' }
    setErrors(next)
    if (next.amount || next.date) return
    if (payTransaction(id, { amountCents: cents, paidBy, paidAt })) onDone()
  }

  const badge = txBadge(tx)
  return (
    <form id={SHEET_FORM.pay} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <p className="text-[15px] text-ink">
        <strong>{tx.description}</strong>
        {badge ? <span className="text-muted"> · {badge}</span> : null}
        <span className="block text-[13px] text-muted">
          Previsto <span className="font-data whitespace-nowrap">{formatCents(tx.amountCents)}</span> para{' '}
          <span className="font-data">
            {tx.competenceDate.slice(8, 10)}/{tx.competenceDate.slice(5, 7)}
          </span>
        </span>
      </p>
      <div>
        <MoneyInput cents={cents} onChange={(c) => (setCents(c), setErrors((x) => ({ ...x, amount: undefined })))} label="Valor pago" testId="pay-amount" />
        {errors.amount ? <FieldError>{errors.amount}</FieldError> : null}
      </div>
      {tx.scope === 'COUPLE' ? (
        <ChoiceChips<PartnerId>
          label="Quem pagou?"
          value={paidBy}
          onChange={setPaidBy}
          options={[
            { value: viewer, label: 'Eu paguei' },
            { value: partnerId, label: `${partner.displayName} pagou` },
          ]}
        />
      ) : null}
      <DateField label="Data do pagamento" value={paidAt} onChange={(v) => (setPaidAt(v), setErrors((x) => ({ ...x, date: undefined })))} error={errors.date} testId="pay-date" past />
      <p className="text-[13px] text-muted">A conta continua no mês do vencimento; só muda para paga (traço sólido).</p>
    </form>
  )
}
