import { Minus, PiggyBank, Plus } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { Button, cx, EditButton, EmptyState, SectionHeader, StatusBadge } from '../../components/ui'
import { toDateKey } from '../../domain/dates'
import { digitsToCents, formatCents } from '../../domain/format'
import { goalView } from '../../domain/together'
import type { SavingsGoal } from '../../domain/types'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { moveGoal } from '../../store/togetherActions'
import { ui } from '../../store/ui'

/** Cursor sempre no fim: os dígitos entram pela direita (mesmo comportamento do campo de gasto) */
const caretToEnd = (e: { currentTarget: HTMLInputElement }) => {
  const el = e.currentTarget
  const end = el.value.length
  if (el.selectionStart !== end || el.selectionEnd !== end) el.setSelectionRange(end, end)
}

/**
 * Valor em reais no estilo caixa eletrônico (dígitos entram pela direita), fonte de dados, alvo de 48px.
 * Veio preenchido (ex.: baixa com o valor previsto)? O primeiro dígito digitado SUBSTITUI o valor e apagar zera,
 * como numa calculadora. Detectado no onChange (teclados Android nem sempre informam a tecla).
 */
export function MoneyInput({ cents, onChange, label, testId, hideLabel }: { cents: number; onChange: (c: number) => void; label: string; testId: string; hideLabel?: boolean }) {
  const id = useId()
  const pristine = useRef(cents > 0)
  const change = (raw: string) => {
    if (!pristine.current) return onChange(digitsToCents(raw))
    pristine.current = false
    const before = String(cents)
    const after = raw.replace(/\D/g, '').replace(/^0+/, '')
    // digitou: fica só o que entrou depois do valor antigo; apagou: zera
    onChange(after.length > before.length && after.startsWith(before) ? digitsToCents(after.slice(before.length)) : 0)
  }
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-2 block text-[14px] font-semibold text-ink'}>
        {label}
      </label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        onFocus={caretToEnd}
        onClick={caretToEnd}
        onKeyDown={caretToEnd}
        onSelect={caretToEnd}
        value={formatCents(cents)}
        onChange={(e) => change(e.target.value)}
        data-testid={testId}
        className="font-data min-h-12 w-full min-w-0 rounded-[16px] border border-line-strong bg-bg px-4 text-[16px] text-ink"
      />
    </div>
  )
}

const FILL = { ok: 'bg-ok', warn: 'bg-warn', action: 'bg-action' } as const

export function GoalsSection() {
  const goals = useData((s) => s.savingsGoals)
  const list = useMemo(() => Object.values(goals).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [goals])
  return (
    <section aria-labelledby="caixinhas" data-testid="goals-section">
      <SectionHeader
        id="caixinhas"
        title="Caixinhas"
        rest="· metas do casal"
        action={
          <Button size="sm" variant="quiet" icon={Plus} onClick={() => ui.openSheet('goal')} data-testid="goal-add">
            Nova caixinha
          </Button>
        }
      />
      {list.length === 0 ? (
        <EmptyState icon={PiggyBank} title="Nenhuma caixinha." text="Viagem, reserva, casa nova: guardem juntos e vejam quanto falta." />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((g) => (
            <GoalCard key={g.id} goal={g} />
          ))}
        </ul>
      )}
    </section>
  )
}

function GoalCard({ goal }: { goal: SavingsGoal }) {
  const today = toDateKey(useNow())
  const v = goalView(goal, today)
  const [cents, setCents] = useState(0)
  const tone = v.done ? 'ok' : v.overdue ? 'warn' : 'action'
  return (
    <li className={cx('card p-4', v.done ? 'ledger-ok' : 'ledger-solid')} data-testid="goal-card" data-goal={goal.title}>
      <div className="-mt-1 -mr-1 flex items-start gap-2">
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-[16px] font-bold break-words text-ink">{goal.title}</p>
          <p className="text-[14px] text-muted">
            <span className="font-data font-semibold whitespace-nowrap text-ink">{formatCents(goal.savedCents)}</span> de{' '}
            <span className="font-data whitespace-nowrap">{formatCents(goal.targetCents)}</span> · casal
          </p>
        </div>
        <EditButton label={`Editar caixinha ${goal.title}`} onClick={() => ui.openSheet('goal', { id: goal.id })} testId="goal-edit" />
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-subtle"
        role="progressbar"
        aria-label={`Progresso de ${goal.title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v.ratio * 100)}
      >
        <div className={cx('h-full rounded-full', FILL[tone])} style={{ width: `${Math.max(2, v.ratio * 100)}%` }} />
      </div>
      <div className="mt-2 text-[13px] text-muted" data-testid="goal-status">
        {v.done ? (
          <StatusBadge kind="ok">Meta batida</StatusBadge>
        ) : (
          <p>
            Faltam <span className="font-data whitespace-nowrap text-ink">{formatCents(v.remainingCents)}</span>
            {v.perMonthCents !== null && goal.deadline ? (
              v.overdue ? (
                <> · prazo passou ({goal.deadline.slice(8, 10)}/{goal.deadline.slice(5, 7)}/{goal.deadline.slice(0, 4)})</>
              ) : (
                <>
                  {' '}
                  · <span className="font-data whitespace-nowrap text-ink">{formatCents(v.perMonthCents)}</span> por mês até{' '}
                  <span className="font-data whitespace-nowrap">
                    {goal.deadline.slice(5, 7)}/{goal.deadline.slice(0, 4)}
                  </span>
                </>
              )
            ) : null}
          </p>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
        <div className="col-span-2 min-w-0">
          <MoneyInput cents={cents} onChange={setCents} label={`Valor para ${goal.title}`} hideLabel testId="goal-amount" />
        </div>
        <Button
          size="compact"
          variant="primary"
          icon={Plus}
          disabled={!cents}
          onClick={() => {
            moveGoal(goal.id, cents)
            setCents(0)
          }}
          data-testid="goal-deposit"
        >
          Guardar
        </Button>
        <Button
          size="compact"
          variant="secondary"
          icon={Minus}
          disabled={!cents || !goal.savedCents}
          onClick={() => {
            moveGoal(goal.id, -cents)
            setCents(0)
          }}
          data-testid="goal-withdraw"
          aria-label={`Tirar da caixinha ${goal.title}`}
        >
          Tirar
        </Button>
      </div>
    </li>
  )
}
