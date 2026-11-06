import { CalendarClock, Coffee, HandHeart, HeartHandshake, LifeBuoy, ListPlus, Package, Pill, Sparkles, Sunrise } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DoseActions, DoseStatus, doseBorder, TaskRow } from '../../components/domain'
import { Button, cx, EmptyState, OwnerTag, SectionHeader, Segmented, StatusBadge, Title } from '../../components/ui'
import { greeting, toDateKey } from '../../domain/dates'
import { formatCents, plural } from '../../domain/format'
import { stockDaysLeft } from '../../domain/medication'
import { filterTasks, leftoverTasks, tasksForDay, type ScopeFilter } from '../../domain/tasks'
import { dosesFor, eventsVisibleTo, nextAction, partnerDelayAlerts, upcomingEvents, type DoseItem } from '../../domain/today'
import type { HelpRequest, Transaction } from '../../domain/types'
import { archiveTasks, bringTasksToToday, markBillPaid, resolveHelp, respondHelp, seeNudge, sendNudge } from '../../store/actions'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { possessive, usePeople } from '../../store/hooks'
import { ui } from '../../store/ui'
import { CycleTodayCards } from '../cycle/CycleSection'
import { PackTodayCards } from '../routines/PackInfo'
import { ENERGY } from '../shell/TopBar'

const HELP_TYPE = {
  TAKE_OVER: 'Assumir por mim',
  BODY_DOUBLING: 'Fazer junto (body doubling)',
  REMIND_ME: 'Me lembrar mais tarde',
} as const
const URGENCY = { NOW: 'Agora', TODAY: 'Ainda hoje', THIS_WEEK: 'Até o fim da semana' } as const

export function TodayScreen() {
  const now = useNow()
  const today = toDateKey(now)
  const { viewer, me, partner } = usePeople()
  const state = useData((s) => s)
  const [filter, setFilter] = useState<ScopeFilter>('ALL')
  const [showAll, setShowAll] = useState(false)

  const d = useMemo(() => {
    const tasks = Object.values(state.tasks)
    const visible = filterTasks(tasks, viewer, 'ALL')
    const myDoses = dosesFor(state, viewer, today, now)
    const events = eventsVisibleTo(Object.values(state.events), viewer)
    const todayTasks = tasksForDay(visible, today)
    return {
      doses: myDoses,
      next: nextAction(myDoses, events, todayTasks.filter((t) => t.assignedTo === viewer || t.assignedTo === null), now),
      todayTasks,
      leftovers: leftoverTasks(visible.filter((t) => t.assignedTo === viewer || t.assignedTo === null), today),
      upcoming: upcomingEvents(events, now),
      alerts: partnerDelayAlerts(state, viewer, now),
      helpIn: Object.values(state.helpRequests).filter((h) => h.requesterId !== viewer && h.status === 'OPEN'),
      helpAnswered: Object.values(state.helpRequests).filter((h) => h.requesterId === viewer && h.status === 'ACCEPTED'),
      helpWaiting: Object.values(state.helpRequests).filter((h) => h.requesterId === viewer && h.status === 'OPEN'),
      nudges: Object.values(state.nudges).filter((n) => n.to === viewer && !n.seenAt),
      nudgedLogs: new Map(Object.values(state.nudges).filter((n) => n.from === viewer).map((n) => [n.medicationLogId, n.createdAt])),
      bills: Object.values(state.transactions).filter((t) => t.scope === 'COUPLE' && t.status === 'PREDICTED_DASHED' && t.competenceDate <= today),
    }
  }, [state, viewer, today, now])

  const overload = me.energy === 'OVERLOAD'
  const filtered = filterTasks(d.todayTasks, viewer, filter)
  const focus = showAll ? filtered : filtered.slice(0, 3)
  const hiddenCount = filtered.length - focus.length

  const header = (
    <div className="mb-5 flex flex-col gap-2">
      <Title size="xl" anchor={`${greeting(now)}, ${me.displayName}.`} rest={overload ? 'Só uma coisa por vez.' : 'Uma coisa de cada vez.'} />
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          {(() => {
            const E = ENERGY[partner.energy]
            return <E.icon size={16} aria-hidden className={partner.energy === 'OVERLOAD' ? 'text-err' : 'text-muted'} />
          })()}
          {partner.displayName} está com {ENERGY[partner.energy].partner} hoje
        </span>
      </p>
      {partner.energy === 'OVERLOAD' ? (
        <p data-testid="partner-calm" className="inline-flex items-center gap-2 self-start rounded-[14px] bg-subtle px-3 py-2 text-[14px] font-semibold text-ink">
          <HeartHandshake size={16} aria-hidden className="text-couple" />
          {partner.displayName} ativou o Modo Calmo hoje. Pegue leve nos pedidos.
        </p>
      ) : null}
    </div>
  )

  const now_ = <NowCard next={d.next} overload={overload} />
  const helpButton = (
    <Button variant="secondary" size="lg" icon={LifeBuoy} onClick={() => ui.openSheet('sos')} className="w-full border-err text-err" data-testid="overload-help">
      Pedir ajuda para {partner.displayName}
    </Button>
  )

  const secondary = (
    <>
      <CycleTodayCards />
      <PackTodayCards />
      {d.nudges.map((n) => (
        <section key={n.id} className="module ledger-dashed p-4 sm:p-5" aria-label="Lembrete carinhoso">
          <p className="flex items-center gap-2 text-[13px] font-bold text-couple">
            <HandHeart size={16} aria-hidden /> Lembrete carinhoso de {partner.displayName}
          </p>
          <p className="mt-2 text-[16px] font-semibold text-ink">{n.message}</p>
          <div className="mt-3">
            <Button size="sm" variant="quiet" onClick={() => seeNudge(n.id)}>
              Recebi, obrigado
            </Button>
          </div>
        </section>
      ))}

      {d.helpIn.map((h) => (
        <HelpInCard key={h.id} req={h} partnerName={partner.displayName} />
      ))}

      {d.helpAnswered.map((h) => (
        <section key={h.id} className="module ledger-ok p-4 sm:p-5" data-testid="help-answered">
          <StatusBadge kind="ok">{h.response === 'TAKE_OVER' ? `${partner.displayName} assumiu` : `${partner.displayName} vai fazer junto`}</StatusBadge>
          <p className="mt-2 text-[16px] font-semibold text-ink">{h.situation}</p>
          <div className="mt-3">
            <Button size="sm" variant="quiet" onClick={() => resolveHelp(h.id)}>
              Combinado, obrigado
            </Button>
          </div>
        </section>
      ))}

      {d.helpWaiting.map((h) => (
        <section key={h.id} className="card ledger-dashed p-4" data-testid="help-waiting">
          <StatusBadge kind="pending">Pedido enviado · aguardando {partner.displayName}</StatusBadge>
          <p className="mt-2 text-[15px] font-semibold text-ink">{h.situation}</p>
          <p className="text-[13px] text-muted">
            {HELP_TYPE[h.helpType]} · {URGENCY[h.urgency]}
          </p>
        </section>
      ))}

      {d.alerts.map((a) => {
        const sentAt = d.nudgedLogs.get(a.log.id)
        return (
          <section key={a.log.id} className="module ledger-err p-4 sm:p-5" data-testid="partner-delay-alert">
            <StatusBadge kind="late">Rede de apoio · atrasado</StatusBadge>
            <p className="mt-2 text-[16px] font-semibold text-ink">
              O remédio das <span className="font-data">{a.log.scheduledTime}</span> de {partner.displayName} ainda consta pendente.
            </p>
            <p className="text-[14px] text-muted">{a.med.name}. Um lembrete gentil costuma ajudar.</p>
            <div className="mt-3">
              {sentAt ? (
                <StatusBadge kind="ok">Lembrete enviado às {new Date(sentAt).toTimeString().slice(0, 5)}</StatusBadge>
              ) : (
                <Button variant="primary" icon={HandHeart} onClick={() => sendNudge(a.log.id, a.med.name)} data-testid="send-nudge">
                  Mandar lembrete carinhoso
                </Button>
              )}
            </div>
          </section>
        )
      })}

      {d.leftovers.length > 0 ? (
        <section className="card ledger-dashed p-4" aria-label="Recomeço leve">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Sunrise size={18} aria-hidden className="text-warn" />
            {d.leftovers.length === 1 ? '1 item de antes ficou pendente.' : `${d.leftovers.length} itens de antes ficaram pendentes.`}
          </p>
          <p className="mt-1 text-[14px] text-muted">Quer trazer para hoje ou arquivar e recomeçar leve? Sem cobrança.</p>
          <ul className="mt-2 text-[14px] text-ink">
            {d.leftovers.slice(0, 3).map((t) => (
              <li key={t.id} className="truncate">
                · {t.title}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="quiet" onClick={() => bringTasksToToday(d.leftovers.map((t) => t.id))}>
              Trazer para hoje
            </Button>
            <Button size="sm" variant="ghost" onClick={() => archiveTasks(d.leftovers.map((t) => t.id))}>
              Arquivar e recomeçar
            </Button>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="foco-title">
        <SectionHeader
          id="foco-title"
          title="Foco do dia"
          rest={`até 3 prioridades`}
          action={
            <Segmented<ScopeFilter>
              label="Filtrar tarefas por pessoa"
              value={filter}
              onChange={(v) => {
                setFilter(v)
                setShowAll(false)
              }}
              size="sm"
              options={[
                { value: 'ALL', label: 'Todos', testId: 'filter-ALL' },
                { value: 'MINE', label: 'Meu', testId: 'filter-MINE' },
                { value: 'PARTNER', label: possessive(partner), testId: 'filter-PARTNER' },
                { value: 'US', label: 'Nós', testId: 'filter-US' },
              ]}
            />
          }
        />
        {focus.length === 0 && d.bills.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Nada urgente para agora."
            text="Aproveite o respiro. Se lembrar de algo, capture em 1 toque."
            action={
              <Button variant="quiet" icon={ListPlus} onClick={() => ui.openSheet('task')}>
                Planejar algo para hoje
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="focus-list">
            {focus.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
            {filter !== 'PARTNER' && filter !== 'MINE' ? d.bills.map((b) => <BillRow key={b.id} bill={b} />) : null}
          </ul>
        )}
        {hiddenCount > 0 ? (
          <button type="button" onClick={() => setShowAll(true)} className="press hoverable mt-2 min-h-12 rounded-[14px] px-3 text-[14px] font-semibold text-action">
            Ver mais {plural(hiddenCount, 'tarefa de hoje', 'tarefas de hoje')}
          </button>
        ) : null}
      </section>

      <section aria-labelledby="proximas-title">
        <SectionHeader id="proximas-title" title="Próximas horas" rest="sem surpresa" />
        <Timeline doses={d.doses} events={d.upcoming} now={now} />
      </section>
    </>
  )

  if (overload) {
    return (
      <div data-testid="today-overload">
        {header}
        <div className="flex flex-col gap-4">
          {now_}
          {helpButton}
          <details className="card group p-0" data-testid="can-wait">
            <summary className="press flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-4 text-[15px] font-semibold text-ink">
              <span className="flex items-center gap-2">
                <Coffee size={18} aria-hidden className="text-muted" /> Pode esperar
              </span>
              <span className="text-[13px] font-medium text-muted">Recolhido no modo sobrecarga</span>
            </summary>
            <div className="flex flex-col gap-4 border-t border-line p-4">{secondary}</div>
          </details>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="today-normal">
      {header}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4 lg:sticky lg:top-8">
          {now_}
          <div className="hidden lg:block">
            <Button variant="secondary" icon={LifeBuoy} onClick={() => ui.openSheet('sos')} className="w-full border-err text-err">
              Pedir ajuda para {partner.displayName}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-4">{secondary}</div>
      </div>
    </div>
  )
}

function NowCard({ next, overload }: { next: ReturnType<typeof nextAction>; overload: boolean }) {
  const now = useNow()
  const big = overload ? 'lg' : 'md'
  if (next.kind === 'dose') {
    const { med, log, view } = next.dose
    const days = stockDaysLeft(med)
    return (
      <section className={cx('module p-4 sm:p-6', doseBorder(view))} aria-labelledby="agora-title" data-testid="now-card">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase">Agora · próxima ação</p>
          <DoseStatus dose={next.dose} now={now} />
        </div>
        <div className="mt-2.5 flex items-start gap-3">
          <span className="mt-0.5 hidden h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-subtle text-ink sm:inline-flex">
            <Pill size={22} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="agora-title" className="text-[18px] leading-tight font-bold text-ink sm:text-[20px]">
              <span className="font-data">{log.scheduledTime}</span> · {med.name}
            </h2>
            <p className="mt-1 text-[13px] text-muted sm:text-[14px]">
              {med.dosage}
              {med.stockCount !== null ? (
                <>
                  {' · '}
                  <span className="font-data">{med.stockCount}</span> na caixa{days !== null ? `, dura uns ${days} dias` : ''}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <DoseActions dose={next.dose} size={big} />
        </div>
      </section>
    )
  }
  if (next.kind === 'event') {
    const { event, minutesUntil } = next
    return (
      <section className="module ledger-dashed p-4 sm:p-6" data-testid="now-card">
        <p className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase">Agora · próxima ação</p>
        <div className="mt-3 flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-subtle text-ink">
            <CalendarClock size={22} aria-hidden />
          </span>
          <div>
            <h2 className="text-[20px] leading-tight font-bold text-ink">{event.title}</h2>
            <p className="mt-1 text-[14px] text-muted">
              <span className="font-data">
                {event.start} a {event.end}
              </span>{' '}
              · {minutesUntil > 0 ? `começa em ${minutesUntil} min` : 'acontecendo agora'}
            </p>
          </div>
        </div>
      </section>
    )
  }
  if (next.kind === 'task') {
    return (
      <section className="module p-4 sm:p-6" data-testid="now-card">
        <p className="mb-3 text-[12px] font-bold tracking-[0.08em] text-muted uppercase">Agora · próxima ação</p>
        <ul>
          <TaskRow task={next.task} />
        </ul>
      </section>
    )
  }
  return (
    <section className="module p-4 sm:p-6" data-testid="now-card">
      <p className="text-[12px] font-bold tracking-[0.08em] text-muted uppercase">Agora · próxima ação</p>
      <p className="mt-3 flex items-center gap-2 text-[18px] font-bold text-ink">
        <Sparkles size={20} aria-hidden className="text-action" /> Nada urgente para agora.
      </p>
      <p className="mt-1 text-[14px] text-muted">Aproveite o respiro.</p>
    </section>
  )
}

function HelpInCard({ req, partnerName }: { req: HelpRequest; partnerName: string }) {
  return (
    <section className="module border border-err p-4 sm:p-5" data-testid="help-request-card" aria-label={`Pedido de apoio de ${partnerName}`}>
      <StatusBadge kind="sos">Pedido de apoio de {partnerName}</StatusBadge>
      <p className="mt-2 text-[16px] font-bold text-ink sm:text-[17px]">{req.situation}</p>
      <p className="mt-1 text-[14px] text-muted">
        {HELP_TYPE[req.helpType]} · <span className="font-semibold text-ink">{URGENCY[req.urgency]}</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" size="compact" icon={HandHeart} onClick={() => respondHelp(req.id, 'TAKE_OVER')} className="grow basis-[130px]" data-testid="help-take-over" aria-label="Deixa comigo (assumir)">
          Deixa comigo
        </Button>
        <Button variant="secondary" size="compact" icon={HeartHandshake} onClick={() => respondHelp(req.id, 'TOGETHER')} className="grow basis-[130px]" data-testid="help-together" aria-label="Vamos fazer juntos">
          Fazer juntos
        </Button>
      </div>
    </section>
  )
}

function BillRow({ bill }: { bill: Transaction }) {
  const { viewer } = usePeople()
  return (
    <li className="flex items-center gap-3 rounded-[18px] bg-surface p-3 ledger-dashed">
      <Package size={20} aria-hidden className="shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-ink">Pagar {bill.description.toLowerCase()}</p>
        <p className="text-[13px] text-muted">
          Previsto <span className="font-data whitespace-nowrap">{formatCents(bill.amountCents)}</span> · conta do casal, vence hoje
        </p>
        <OwnerTag tone="us">Nós</OwnerTag>
      </div>
      <Button size="sm" variant="quiet" onClick={() => markBillPaid(bill.id, viewer)}>
        Paguei
      </Button>
    </li>
  )
}

function Timeline({ doses, events, now }: { doses: DoseItem[]; events: ReturnType<typeof upcomingEvents>; now: Date }) {
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const items = [
    ...doses
      .filter((d) => d.view !== 'TAKEN' && d.view !== 'SKIPPED')
      .filter((d) => {
        const [h, m] = d.log.scheduledTime.split(':').map(Number)
        const t = (h ?? 0) * 60 + (m ?? 0)
        return t >= nowMin - 60 && t <= nowMin + 240
      })
      .map((d) => ({ key: d.log.id, time: d.log.scheduledTime, title: d.med.name, kind: d.med.kind === 'ROUTINE' ? 'Rotina' : 'Remédio', dashed: true })),
    ...events.map((e) => ({ key: e.id, time: e.start, title: e.title, kind: e.kind === 'COUPLE' ? 'Do casal' : e.kind === 'HEALTH' ? 'Saúde' : 'Compromisso', dashed: false })),
  ].sort((a, b) => a.time.localeCompare(b.time))
  if (items.length === 0) {
    return <p className="rounded-[18px] border border-dashed border-line-strong p-4 text-[14px] text-muted">Nada marcado nas próximas 4 horas.</p>
  }
  return (
    <ol className="relative flex flex-col gap-2 border-l border-line-strong pl-4">
      {items.map((i) => (
        <li key={i.key} className="relative">
          <span aria-hidden className="absolute top-3.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-line-strong bg-bg" />
          <div className={cx('rounded-[14px] bg-surface px-3 py-2', i.dashed ? 'ledger-dashed' : 'ledger-solid')}>
            <span className="font-data text-[13px] text-muted">{i.time}</span>
            <span className="ml-2 text-[15px] font-semibold text-ink">{i.title}</span>
            <span className="ml-2 text-[12px] text-muted">{i.kind}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}
