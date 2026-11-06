import { ArrowRightLeft, CircleCheck, CircleDashed, Eye, EyeOff, Gift, Lock, ReceiptText, User, Users } from 'lucide-react'
import { GoalsSection } from './GoalsSection'
import { useMemo, useState } from 'react'
import { CATEGORIES } from '../../components/categories'
import { Button, cx, EmptyState, MoneyText, OwnerTag, SectionHeader, Segmented, StatusBadge, Switch, Title } from '../../components/ui'
import { dayOfMonth, monthName, parseDateKey, toDateKey } from '../../domain/dates'
import { computeCoupleBalance, coupleShareTotal, describeBalance, settlementPlan, shareOf, splitRuleLabel } from '../../domain/finance'
import { formatCents } from '../../domain/format'
import { personalTabView } from '../../domain/privacy'
import type { PartnerId, Transaction } from '../../domain/types'
import { markBillPaid, setSharePersonal, settleMonth } from '../../store/actions'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { possessive, toneOf, useCouple, usePeople } from '../../store/hooks'
import { ui } from '../../store/ui'

type FinTab = 'US' | 'MINE' | 'PARTNER'

export function FinanceScreen() {
  const now = useNow()
  const today = toDateKey(now)
  const month = today.slice(0, 7)
  const { partner } = usePeople()
  const [tab, setTab] = useState<FinTab>('US')
  const label = monthName(today)

  return (
    <div>
      <div className="mb-4">
        <Title anchor={`Finanças de ${label},`} rest="claras e leves." />
      </div>
      <div className="mb-5">
        <Segmented<FinTab>
          label="Escopo financeiro"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'US', label: 'Do casal (Nós)', icon: Users, testId: 'fin-US' },
            { value: 'MINE', label: 'Meu', icon: User, testId: 'fin-MINE' },
            { value: 'PARTNER', label: possessive(partner), icon: User, testId: 'fin-PARTNER' },
          ]}
        />
      </div>
      {tab === 'US' ? <CoupleTab month={month} monthLabel={label} /> : null}
      {tab === 'MINE' ? <PersonalTab month={month} owner="me" /> : null}
      {tab === 'PARTNER' ? <PersonalTab month={month} owner="partner" /> : null}
    </div>
  )
}

function CoupleTab({ month, monthLabel }: { month: string; monthLabel: string }) {
  const { viewer, partner, partnerId, profiles } = usePeople()
  const couple = useCouple()
  const txMap = useData((s) => s.transactions)
  const d = useMemo(() => {
    const all = Object.values(txMap)
    const couples = all.filter((t) => t.scope === 'COUPLE' && t.competenceDate.slice(0, 7) === month)
    const balance = computeCoupleBalance(all, month)
    return {
      balance,
      predicted: couples.filter((t) => t.type === 'EXPENSE' && t.status === 'PREDICTED_DASHED').sort((a, b) => a.competenceDate.localeCompare(b.competenceDate)),
      confirmed: couples.filter((t) => t.type === 'EXPENSE' && t.status === 'CONFIRMED_SOLID').sort((a, b) => b.competenceDate.localeCompare(a.competenceDate)),
      settlements: couples.filter((t) => t.type === 'SETTLEMENT'),
      myShare: coupleShareTotal(all, viewer, month),
    }
  }, [txMap, month, viewer])
  const plan = settlementPlan(d.balance.netCents)
  const sentence = describeBalance(d.balance.netCents, viewer, profiles, monthLabel)
  const lastDay = new Date(parseDateKey(`${month}-01`).getFullYear(), parseDateKey(`${month}-01`).getMonth() + 1, 0).getDate()

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
      <section className={cx('module p-4 sm:p-6', plan ? '' : 'ledger-ok')} aria-labelledby="encontro" data-testid="balance-card">
        <p id="encontro" className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase">
          Encontro de contas · {monthLabel}
        </p>
        <p className="mt-3 text-[22px] leading-snug font-bold text-ink" data-testid="balance-sentence">
          <MoneyText>{sentence}</MoneyText>
        </p>
        <dl className="mt-4 flex flex-col gap-2">
          <div className="ledger-solid flex items-center justify-between gap-3 rounded-[14px] px-3 py-2.5">
            <dt className="flex min-w-0 items-center gap-2 text-[14px] text-ink">
              <CircleCheck size={17} aria-hidden className="text-ok" /> Realizado do casal ({d.balance.confirmedCount} gastos)
            </dt>
            <dd className="font-data shrink-0 text-[15px] font-semibold whitespace-nowrap text-ink">{formatCents(d.balance.confirmedTotalCents)}</dd>
          </div>
          <div className="ledger-dashed flex items-center justify-between gap-3 rounded-[14px] px-3 py-2.5">
            <dt className="flex min-w-0 items-center gap-2 text-[14px] text-ink">
              <CircleDashed size={17} aria-hidden className="text-warn" /> Previsto até dia {lastDay}
            </dt>
            <dd className="font-data shrink-0 text-[15px] font-semibold whitespace-nowrap text-ink">+ {formatCents(d.balance.predictedTotalCents)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 pt-1">
            <dt className="min-w-0 text-[13px] text-muted">Sua parte no realizado deste mês</dt>
            <dd className="font-data shrink-0 text-[14px] whitespace-nowrap text-ink">{formatCents(d.myShare)}</dd>
          </div>
        </dl>
        <div className="mt-5">
          {plan ? (
            <Button variant="primary" size="lg" icon={ArrowRightLeft} onClick={settleMonth} className="w-full" data-testid="settle">
              Registrar acerto de {formatCents(plan.amountCents)}
            </Button>
          ) : (
            <StatusBadge kind="ok">Saldo zerado · nada a acertar</StatusBadge>
          )}
          <p className="mt-2 text-[13px] text-muted">
            Divisão padrão: {couple.splitMode === 'PROPORTIONAL' ? splitRuleLabel('PROPORTIONAL', couple.ratioABps) : 'Divisão 50/50'}. Ajuste em Ajustes.
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-6">
        <section aria-labelledby="previstos">
          <SectionHeader id="previstos" title="Contas previstas" rest="· tracejado até pagar" />
          {d.predicted.length === 0 ? (
            <p className="rounded-[18px] border border-dashed border-line-strong p-4 text-[14px] text-muted">Nenhuma conta prevista para o resto do mês.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {d.predicted.map((t) => (
                <li key={t.id} className="ledger-dashed rounded-[18px] bg-surface p-3" data-testid="predicted-row">
                  <TxHeader tx={t} />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge kind="pending">Previsto p/ dia {dayOfMonth(t.competenceDate)}</StatusBadge>
                    <span className="text-[13px] text-muted">{splitRuleLabel(t.splitRule, couple.ratioABps)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="quiet" icon={CircleCheck} onClick={() => markBillPaid(t.id, viewer)}>
                      Eu paguei
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => markBillPaid(t.id, partnerId)}>
                      {partner.displayName} pagou
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="lancamentos">
          <SectionHeader
            id="lancamentos"
            title="Lançamentos do casal"
            rest="· realizado"
            action={
              <Button size="sm" variant="quiet" icon={ReceiptText} onClick={() => ui.openSheet('expense', { scope: 'COUPLE' })}>
                Novo gasto
              </Button>
            }
          />
          {d.confirmed.length === 0 && d.settlements.length === 0 ? (
            <EmptyState icon={ReceiptText} title="Nenhum gasto do casal ainda." text="Registre em 1 toque no botão Gasto." />
          ) : (
            <ul className="flex flex-col gap-2" data-testid="couple-list">
              {d.confirmed.map((t) => {
                const other = t.paidBy === 'A' ? 'B' : 'A'
                return (
                  <li key={t.id} className="ledger-solid rounded-[18px] bg-surface p-3" data-testid="couple-row">
                    <TxHeader tx={t} />
                    <p className="mt-1 text-[13px] text-muted">
                      Pago por {t.paidBy === viewer ? 'você' : profiles[t.paidBy].displayName} · {splitRuleLabel(t.splitRule, couple.ratioABps)} · parte{' '}
                      {other === viewer ? 'sua' : `de ${profiles[other].displayName}`}: <span className="font-data whitespace-nowrap text-ink">{formatCents(shareOf(t, other))}</span>
                    </p>
                  </li>
                )
              })}
              {d.settlements.map((t) => (
                <li key={t.id} className="ledger-ok rounded-[18px] bg-ok-soft p-3">
                  <p className="flex items-center justify-between gap-2 text-[15px] font-semibold text-ink">
                    <span className="flex items-center gap-2">
                      <ArrowRightLeft size={17} aria-hidden className="text-ok" /> Acerto registrado
                    </span>
                    <span className="font-data shrink-0 whitespace-nowrap">{formatCents(t.amountCents)}</span>
                  </p>
                  <p className="text-[13px] text-muted">
                    {t.paidBy === viewer ? 'Você' : profiles[t.paidBy].displayName} transferiu em {dayOfMonth(t.competenceDate)}/{t.competenceDate.slice(5, 7)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <GoalsSection />
      </div>
    </div>
  )
}

function TxHeader({ tx, masked }: { tx: Transaction; masked?: boolean }) {
  const C = CATEGORIES[tx.category]
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-ink">
        <C.icon size={18} aria-hidden className="shrink-0 text-muted" />
        <span className="truncate">{masked ? 'Item reservado' : tx.description}</span>
      </p>
      <span className="font-data shrink-0 text-[15px] font-semibold whitespace-nowrap text-ink">{formatCents(tx.amountCents)}</span>
    </div>
  )
}

function PersonalTab({ month, owner }: { month: string; owner: 'me' | 'partner' }) {
  const { viewer, partnerId, me, partner, profiles } = usePeople()
  const txMap = useData((s) => s.transactions)
  const ownerId: PartnerId = owner === 'me' ? viewer : partnerId
  const view = useMemo(() => personalTabView(Object.values(txMap), ownerId, viewer, profiles, month), [txMap, ownerId, viewer, profiles, month])

  if (view.status === 'closed') {
    return (
      <div data-testid="personal-closed" className="module flex flex-col items-center px-6 py-10 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-subtle text-muted">
          <Lock size={26} aria-hidden />
        </span>
        <p className="mt-4 text-[18px] font-bold text-ink">Visão pessoal fechada no momento.</p>
        <p className="mt-1 max-w-[42ch] text-[15px] text-muted">
          {view.ownerName} preferiu manter os gastos pessoais só para si agora. Os gastos do casal seguem visíveis na aba Nós.
        </p>
      </div>
    )
  }

  const items = view.items
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
      <div className="flex flex-col gap-4">
        {view.status === 'own' ? (
          <section className="module p-4 sm:p-5" aria-label="Transparência mútua">
            <Switch
              checked={me.sharePersonalFinances}
              onChange={setSharePersonal}
              testId="share-toggle"
              label={
                <span className="inline-flex items-center gap-2">
                  {me.sharePersonalFinances ? <Eye size={18} aria-hidden className="text-action" /> : <EyeOff size={18} aria-hidden className="text-muted" />}
                  Permitir que {partner.displayName} veja meus gastos pessoais
                </span>
              }
              description={
                me.sharePersonalFinances
                  ? 'Ativado: leitura apenas. Presentes e surpresas continuam ocultos.'
                  : 'Desativado: só os gastos do casal ficam visíveis.'
              }
            />
          </section>
        ) : (
          <StatusBadge kind="ok" className="self-start">
            {view.ownerName} liberou a leitura · somente leitura
          </StatusBadge>
        )}
        <section className="module p-4 sm:p-5" data-testid="personal-total">
          <p className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase">
            {view.status === 'own' ? 'Meus gastos pessoais' : `Gastos pessoais de ${view.ownerName}`}
          </p>
          <p className="font-data mt-2 text-[28px] font-semibold whitespace-nowrap text-ink">{formatCents(view.totalCents)}</p>
          <p className="text-[13px] text-muted">pagos neste mês, fora a parte no casal</p>
          {view.status === 'readonly' ? <p className="mt-2 text-[12px] text-muted">O total pode incluir itens reservados.</p> : null}
        </section>
      </div>

      <section aria-labelledby="pessoais">
        <SectionHeader
          id="pessoais"
          title="Lançamentos"
          rest={view.status === 'own' ? '· só seus' : '· somente leitura'}
          action={
            view.status === 'own' ? (
              <Button size="sm" variant="quiet" icon={ReceiptText} onClick={() => ui.openSheet('expense', { scope: 'PERSONAL' })}>
                Novo gasto
              </Button>
            ) : undefined
          }
        />
        {items.length === 0 ? (
          <EmptyState icon={ReceiptText} title="Nenhum lançamento pessoal neste mês." text="Os gastos que forem só seus aparecem aqui." />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="personal-list">
            {items.map((t) => (
              <li
                key={t.id}
                data-testid="personal-row"
                className={cx('rounded-[18px] bg-surface p-3', t.status === 'PREDICTED_DASHED' ? 'ledger-dashed' : 'ledger-solid')}
              >
                <TxHeader tx={t} />
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <OwnerTag tone={toneOf(ownerId)}>{owner === 'me' ? 'Meu' : possessive(partner)}</OwnerTag>
                  <span className="text-[13px] text-muted">{CATEGORIES[t.category].label}</span>
                  <span className="font-data text-[12px] text-muted">
                    {dayOfMonth(t.competenceDate)}/{t.competenceDate.slice(5, 7)}
                  </span>
                  {t.status === 'PREDICTED_DASHED' ? <StatusBadge kind="pending">Previsto</StatusBadge> : null}
                  {t.isSecretGift ? (
                    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-couple">
                      <Gift size={13} aria-hidden /> Presente · oculto para {partner.displayName}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
