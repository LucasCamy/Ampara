import { ReceiptText, Repeat } from 'lucide-react'
import { useMemo } from 'react'
import { Button, EditButton, SectionHeader } from '../../components/ui'
import { toDateKey } from '../../domain/dates'
import { formatCents } from '../../domain/format'
import { canViewRule, monthOf, ruleActiveIn, shiftMonth } from '../../domain/ledger'
import type { TxScope } from '../../domain/types'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { ui } from '../../store/ui'

/** Contas fixas do casal ou as minhas (as pessoais do par nunca aparecem: canViewRule) */
export function RulesSection({ scope }: { scope: TxScope }) {
  const today = toDateKey(useNow())
  const current = monthOf(today)
  const { viewer } = usePeople()
  const all = useData((s) => s.recurrences)
  const rules = useMemo(
    () =>
      Object.values(all)
        .filter((r) => canViewRule(r, viewer) && r.scope === scope && (!r.endMonth || r.endMonth >= current))
        .sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.description.localeCompare(b.description)),
    [all, viewer, scope, current],
  )
  const total = rules.filter((r) => ruleActiveIn(r, current)).reduce((s, r) => s + r.amountCents, 0)

  return (
    <section aria-labelledby={`fixas-${scope}`} data-testid={`rules-${scope}`}>
      <SectionHeader
        id={`fixas-${scope}`}
        title="Contas fixas"
        rest={rules.length ? `· ${formatCents(total)} por mês` : '· todo mês sozinhas'}
        action={
          <Button size="sm" variant="quiet" icon={ReceiptText} onClick={() => ui.openSheet('expense', { scope, status: 'PREDICTED_DASHED', repeat: 'MONTHLY' })} data-testid={`rule-add-${scope}`}>
            Nova conta fixa
          </Button>
        }
      />
      {rules.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-line-strong p-4 text-[14px] text-muted">
          Aluguel, internet, streaming: cadastre uma vez e o app põe nos próximos meses como previsto.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((r) => (
            <li key={r.id} className="ledger-dashed flex items-center gap-3 rounded-[18px] bg-surface p-3" data-testid="rule-row" data-title={r.description}>
              <Repeat size={18} aria-hidden className="shrink-0 text-couple" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold break-words text-ink">{r.description}</p>
                <p className="text-[13px] text-muted">
                  <span className="font-data whitespace-nowrap text-ink">{formatCents(r.amountCents)}</span> · todo dia <span className="font-data">{r.dayOfMonth}</span>
                  {r.endMonth ? (
                    <>
                      {' '}
                      · até <span className="font-data">{r.endMonth.slice(5, 7)}/{r.endMonth.slice(0, 4)}</span>
                    </>
                  ) : null}
                  {r.skipMonths.includes(current) || r.skipMonths.includes(shiftMonth(current, 1)) ? ' · com mês pulado' : ''}
                </p>
              </div>
              <EditButton label={`Editar conta fixa ${r.description}`} onClick={() => ui.openSheet('rule', { id: r.id })} testId="rule-edit" />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
