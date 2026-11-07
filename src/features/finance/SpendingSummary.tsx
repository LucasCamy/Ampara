import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { CATEGORIES } from '../../components/categories'
import { cx, SectionHeader } from '../../components/ui'
import { formatCents } from '../../domain/format'
import { monthTitle, shiftMonth } from '../../domain/ledger'
import { categorySummary } from '../../domain/summary'
import type { Transaction } from '../../domain/types'

/** Cor da barra = de quem é o gasto (a cor segue a entidade, nunca a posição) */
const TONE = { us: 'bg-couple', a: 'bg-partner-a', b: 'bg-partner-b' } as const

/** Diferença em texto, com ícone; sem cor de estado (gastar mais não é "erro") */
function Delta({ now, before, prevName }: { now: number; before: number; prevName: string }) {
  if (!before) return <span>novo em relação a {prevName}</span>
  const diff = now - before
  if (Math.abs(diff) < 100) {
    return (
      <span className="inline-flex items-center gap-1">
        <Minus size={13} aria-hidden /> igual a {prevName}
      </span>
    )
  }
  const Icon = diff > 0 ? TrendingUp : TrendingDown
  return (
    <span className="inline-flex items-center gap-1">
      <Icon size={13} aria-hidden />
      <span className="font-data whitespace-nowrap">{formatCents(Math.abs(diff))}</span> {diff > 0 ? 'a mais' : 'a menos'} que {prevName}
    </span>
  )
}

/**
 * "Para onde foi": barras horizontais ranqueadas (uma série). Os valores ficam em texto ao lado do nome,
 * então a lista já é a própria tabela (sem precisar de dica no toque); a barra é só reforço visual.
 */
export function SpendingSummary({
  transactions,
  month,
  current,
  tone,
  whose,
  testId,
}: {
  /** já filtrados pela privacidade de quem está vendo */
  transactions: Transaction[]
  month: string
  /** mês atual (para escrever "outubro" ou "outubro de 2025") */
  current: string
  tone: keyof typeof TONE
  whose: string
  testId: string
}) {
  const prev = shiftMonth(month, -1)
  const s = useMemo(() => categorySummary(transactions, month, prev), [transactions, month, prev])
  const prevName = monthTitle(prev, current)
  const max = s.rows[0]?.cents ?? 0
  return (
    <section aria-labelledby={`${testId}-title`} data-testid={testId}>
      <SectionHeader id={`${testId}-title`} title="Para onde foi" rest={`· ${whose}, pagos em ${monthTitle(month, current)}`} />
      {s.rows.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-line-strong p-4 text-[14px] text-muted">Nenhum gasto pago neste mês ainda.</p>
      ) : (
        <div className="card p-4">
          <p className="text-[14px] text-muted">
            <span className="font-data text-[18px] font-semibold whitespace-nowrap text-ink">{formatCents(s.totalCents)}</span> no total ·{' '}
            {s.prevTotalCents ? <Delta now={s.totalCents} before={s.prevTotalCents} prevName={prevName} /> : <span>sem gastos em {prevName} para comparar</span>}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {s.rows.map((r) => {
              const C = CATEGORIES[r.category]
              return (
                <li key={r.category} data-testid="spend-row" data-category={r.category}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-ink">
                      <C.icon size={16} aria-hidden className="shrink-0 text-muted" />
                      <span className="truncate">{C.label}</span>
                    </span>
                    <span className="shrink-0 text-[14px] text-ink">
                      <span className="font-data font-semibold whitespace-nowrap">{formatCents(r.cents)}</span>
                      <span className="text-muted"> · {Math.round(r.share * 100)}%</span>
                    </span>
                  </div>
                  <div aria-hidden className="mt-1.5 h-2 overflow-hidden rounded-full bg-subtle">
                    <div className={cx('h-full rounded-full', TONE[tone])} style={{ width: `${Math.max(2, (r.cents / max) * 100)}%` }} />
                  </div>
                  {/* sem mês anterior para comparar, a linha só repetiria o aviso: fica só no total */}
                  {s.prevTotalCents ? (
                    <p className="mt-1 text-[12px] text-muted">
                      <Delta now={r.cents} before={r.prevCents} prevName={prevName} />
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
