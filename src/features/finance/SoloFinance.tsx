import { CircleCheck, Pencil, ReceiptText } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { CATEGORIES } from '../../components/categories'
import { Button, cx, EmptyState, SectionHeader, StatusBadge } from '../../components/ui'
import { formatCents } from '../../domain/format'
import { isOverdue, monthTitle } from '../../domain/ledger'
import { visibleTransactions } from '../../domain/privacy'
import { useData } from '../../store/data'
import { MAX_MONTHLY_BUDGET_CENTS, quickPay, setMonthlyBudgetCents } from '../../store/financeActions'
import { usePeople } from '../../store/hooks'
import { ui } from '../../store/ui'
import { GoalsSection, MoneyInput } from './GoalsSection'
import { RulesSection } from './RulesSection'
import { SpendingSummary } from './SpendingSummary'
import { DueBadge, SeriesTag, TxHeader } from './TransactionParts'

/** Um único painel pessoal. Toda seleção financeira começa na regra de privacidade. */
export function SoloFinance({ month, today }: { month: string; today: string }) {
  const { viewer, profiles, me } = usePeople()
  const transactions = useData((s) => s.transactions)
  const own = useMemo(
    () => visibleTransactions(Object.values(transactions), viewer, profiles).filter((tx) => tx.scope === 'PERSONAL' && tx.createdBy === viewer),
    [transactions, viewer, profiles],
  )
  const inMonth = own.filter((tx) => tx.competenceDate.slice(0, 7) === month)
  const bills = inMonth.filter((tx) => tx.type === 'EXPENSE' && tx.status === 'PREDICTED_DASHED').sort((a, b) => a.competenceDate.localeCompare(b.competenceDate))
  const entries = inMonth.filter((tx) => tx.type !== 'SETTLEMENT' && tx.status === 'CONFIRMED_SOLID').sort((a, b) => b.competenceDate.localeCompare(a.competenceDate))
  const realized = entries.filter((tx) => tx.type === 'EXPENSE').reduce((total, tx) => total + tx.amountCents, 0)
  const predicted = bills.reduce((total, tx) => total + tx.amountCents, 0)

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start" data-testid="solo-finance">
      <section className="module p-4 sm:p-5 lg:col-start-1 lg:row-start-1" aria-labelledby="solo-month-summary" data-testid="personal-total">
        <SectionHeader id="solo-month-summary" title="Resumo do mês" rest={`· ${monthTitle(month, today.slice(0, 7))}`} />
        <p className="mb-3 text-[13px] text-muted">Seus gastos neste mês.</p>
        <dl className="flex flex-col gap-2">
          <div className="ledger-solid flex flex-wrap items-center justify-between gap-3 rounded-[14px] px-3 py-3">
            <dt><StatusBadge kind="ok">Realizado</StatusBadge></dt>
            <dd className="font-data text-[18px] font-semibold whitespace-nowrap text-ink" data-testid="solo-realized">{formatCents(realized)}</dd>
          </div>
          <div className="ledger-dashed flex flex-wrap items-center justify-between gap-3 rounded-[14px] px-3 py-3">
            <dt><StatusBadge kind="pending">Previsto</StatusBadge></dt>
            <dd className="font-data text-[18px] font-semibold whitespace-nowrap text-ink" data-testid="solo-predicted">{formatCents(predicted)}</dd>
          </div>
        </dl>
        <MonthlyBudget budget={me.monthlyBudgetCents ?? null} realized={realized} month={month} />
      </section>

      <section aria-labelledby="solo-bills" className="lg:col-start-2 lg:row-start-1">
        <SectionHeader id="solo-bills" title="Contas a pagar" rest={bills.some((tx) => isOverdue(tx, today)) ? '· tem vencida' : '· deste mês'} />
        {bills.length === 0 ? (
          <p className="rounded-[18px] border border-dashed border-line-strong p-4 text-[14px] text-muted">Nenhuma conta a pagar neste mês.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="solo-bills">
            {bills.map((tx) => (
              <li key={tx.id} className={cx('rounded-[18px] bg-surface p-3', isOverdue(tx, today) ? 'ledger-err' : 'ledger-dashed')} data-testid="predicted-row" data-title={tx.description}>
                <TxHeader tx={tx} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <DueBadge tx={tx} today={today} />
                  <SeriesTag tx={tx} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="compact" variant="primary" icon={CircleCheck} onClick={() => quickPay(tx.id, viewer)} data-testid="pay-me">Paguei</Button>
                  <Button size="compact" onClick={() => ui.openSheet('pay', { id: tx.id })}>Outro valor</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="solo-entries" className="lg:col-start-2 lg:row-start-2">
        <SectionHeader
          id="solo-entries"
          title="Lançamentos"
          rest="· realizados"
          action={<Button size="sm" variant="quiet" icon={ReceiptText} onClick={() => ui.openSheet('expense', { scope: 'PERSONAL' })}>Novo gasto</Button>}
        />
        {entries.length === 0 ? (
          <EmptyState icon={ReceiptText} title="Nenhum lançamento realizado neste mês." text="Seus gastos pagos aparecem aqui. As contas previstas ficam acima." />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="personal-list">
            {entries.map((tx) => (
              <li key={tx.id} className="ledger-solid rounded-[18px] bg-surface p-3" data-testid="personal-row" data-title={tx.description}>
                <TxHeader tx={tx} />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                  <StatusBadge kind="ok">{tx.type === 'INCOME' ? 'Recebido' : 'Pago'}</StatusBadge>
                  <span>{CATEGORIES[tx.category].label}</span>
                  <span className="font-data">{tx.competenceDate.slice(8, 10)}/{tx.competenceDate.slice(5, 7)} · seu</span>
                  <SeriesTag tx={tx} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="lg:col-start-1 lg:row-start-2">
        <SpendingSummary transactions={own} month={month} current={today.slice(0, 7)} tone={viewer === 'A' ? 'a' : 'b'} whose="seus" testId="spend-personal" />
      </div>
      <div className="lg:col-start-1 lg:row-start-3"><RulesSection scope="PERSONAL" /></div>
      <div className="lg:col-start-2 lg:row-start-3"><GoalsSection /></div>
    </div>
  )
}

function MonthlyBudget({ budget, realized, month }: { budget: number | null; realized: number; month: string }) {
  const [editing, setEditing] = useState(false)
  const ratio = budget === null || budget === 0 ? (realized > 0 && budget === 0 ? 100 : 0) : Math.min(100, Math.round(realized / budget * 100))
  return (
    <div className="mt-4 border-t border-line pt-4" data-testid="monthly-budget">
      {editing ? (
        <BudgetEditor initial={budget} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] font-semibold text-ink">Teto mensal</p>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)} data-testid="budget-edit">{budget === null ? 'Definir teto' : 'Editar teto'}</Button>
          </div>
          {budget === null ? (
            <p className="text-[13px] text-muted">Opcional. Escolha um valor que ajude a acompanhar seus gastos.</p>
          ) : (
            <>
              <p className="text-[14px] text-muted"><span className="font-data font-semibold text-ink">{formatCents(budget)}</span> por mês · só seu</p>
              <div
                role="progressbar"
                aria-label={`Gastos realizados em ${monthTitle(month, '')} em relação ao seu teto mensal`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={ratio}
                aria-valuetext={`${formatCents(realized)} realizados de ${formatCents(budget)} de teto mensal`}
                className="mt-3 h-2 overflow-hidden rounded-full bg-subtle"
                data-testid="budget-progress"
              >
                <div className="h-full rounded-full bg-action" style={{ width: `${ratio}%` }} />
              </div>
              <p className="mt-2 text-[13px] text-muted">
                <span className="font-data">{formatCents(Math.abs(budget - realized))}</span> {realized > budget ? 'acima do teto neste mês.' : 'até o teto neste mês.'}
              </p>
              <Button size="sm" variant="ghost" className="mt-1" onClick={() => setMonthlyBudgetCents(null)} data-testid="budget-remove">Remover teto</Button>
            </>
          )}
        </>
      )}
    </div>
  )
}

function BudgetEditor({ initial, onDone }: { initial: number | null; onDone: () => void }) {
  const [cents, setCents] = useState(initial ?? 0)
  const [error, setError] = useState<string>()
  const id = useId()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!setMonthlyBudgetCents(cents)) {
      setError(`Use um valor entre R$ 0,00 e ${formatCents(MAX_MONTHLY_BUDGET_CENTS)}.`)
      return
    }
    onDone()
  }
  return (
    <form onSubmit={submit} aria-label="Editar teto mensal" noValidate>
      <MoneyInput label="Seu teto por mês" cents={cents} onChange={(value) => { setCents(value); setError(undefined) }} testId="budget-amount" error={error} describedBy={`${id}-help`} />
      <p id={`${id}-help`} className="mt-2 text-[13px] text-muted">Vale para cada mês. Você pode mudar ou remover quando quiser.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="submit" size="compact" variant="primary" data-testid="budget-save">Salvar teto</Button>
        <Button size="compact" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}
