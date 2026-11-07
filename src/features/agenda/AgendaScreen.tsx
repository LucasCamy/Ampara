import { CalendarPlus, CircleCheck, CircleDashed, ChevronLeft, ChevronRight, Droplet, Heart, HeartHandshake, Inbox, ListPlus, Mail, MoveRight, Sun, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TaskRow } from '../../components/domain'
import { Button, cx, EditButton, EmptyState, OwnerTag, Segmented, StatusBadge, Title } from '../../components/ui'
import { addDays, dayOfMonth, monthGrid, monthName, parseDateKey, relativeDayLabel, toDateKey, weekDays, weekdayLong, weekdayShort } from '../../domain/dates'
import { formatCents } from '../../domain/format'
import { agendaMarks, marksForScope, type DayMark, type MarkKind } from '../../domain/agenda'
import { isScheduledOn } from '../../domain/medication'
import { dayLoad, filterTasks, inboxTasks, matchesScope, tasksForDay, type DayLoad, type ScopeFilter } from '../../domain/tasks'
import { eventsVisibleTo } from '../../domain/today'
import type { CalendarEvent, DateKey, Medication, Transaction } from '../../domain/types'
import { postponeTask, scheduleTaskToday, sendTaskToPartner, toggleTask } from '../../store/actions'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { ownerLabel, possessive, toneOf, usePeople } from '../../store/hooks'
import { ui } from '../../store/ui'

type View = 'DAY' | 'WEEK' | 'MONTH' | 'INBOX'

export function AgendaScreen() {
  const now = useNow()
  const today = toDateKey(now)
  const { viewer, partner } = usePeople()
  const [view, setView] = useState<View>('DAY')
  const [scope, setScope] = useState<ScopeFilter>('ALL')
  const [cursor, setCursor] = useState<DateKey>(today)
  const tasksMap = useData((s) => s.tasks)
  const eventsMap = useData((s) => s.events)
  const txMap = useData((s) => s.transactions)
  const medsMap = useData((s) => s.meds)
  const specialMap = useData((s) => s.specialDates)
  const cycleLogsMap = useData((s) => s.cycleLogs)
  const cycleSettings = useData((s) => s.cycleSettings)
  const { partnerId, profiles } = usePeople()

  const data = useMemo(() => {
    const tasks = filterTasks(Object.values(tasksMap), viewer, scope)
    const events = eventsVisibleTo(Object.values(eventsMap), viewer).filter((e) => matchesScope(e.ownerId, scope, viewer))
    // contas que vencem: as do casal e as minhas pessoais (parcelas e fixas entram aqui também)
    const bills = Object.values(txMap).filter(
      (t) =>
        t.type === 'EXPENSE' &&
        t.status === 'PREDICTED_DASHED' &&
        ((t.scope === 'COUPLE' && (scope === 'ALL' || scope === 'US')) || (t.scope === 'PERSONAL' && t.createdBy === viewer && (scope === 'ALL' || scope === 'MINE'))),
    )
    const meds = Object.values(medsMap).filter((m) => (m.ownerId === viewer && (scope === 'ALL' || scope === 'MINE')) || (m.ownerId === null && (scope === 'ALL' || scope === 'US')))
    // datas especiais e ciclo (o do par só como a dona liberou), numa janela em volta do dia escolhido
    const marks = marksForScope(
      agendaMarks(
        {
          viewer,
          partnerId,
          names: { A: profiles.A.displayName, B: profiles.B.displayName },
          specialDates: Object.values(specialMap),
          cycleLogs: Object.values(cycleLogsMap),
          cycleSettings,
          today,
        },
        addDays(cursor, -45),
        addDays(cursor, 45),
      ),
      scope,
    )
    return { tasks, events, bills, meds, marks }
  }, [tasksMap, eventsMap, txMap, medsMap, specialMap, cycleLogsMap, cycleSettings, viewer, partnerId, profiles, scope, cursor, today])

  const step = view === 'DAY' ? 1 : view === 'WEEK' ? 7 : 0
  const move = (dir: 1 | -1) => {
    if (view === 'MONTH') {
      const d = parseDateKey(cursor)
      setCursor(toDateKey(new Date(d.getFullYear(), d.getMonth() + dir, 1)))
    } else setCursor(addDays(cursor, dir * step))
  }

  const rangeLabel =
    view === 'DAY'
      ? `${relativeDayLabel(cursor, today)} · ${weekdayLong(cursor)}, ${dayOfMonth(cursor)} de ${monthName(cursor)}`
      : view === 'WEEK'
        ? (() => {
            const w = weekDays(cursor)
            return `Semana de ${dayOfMonth(w[0]!)}/${parseDateKey(w[0]!).getMonth() + 1} a ${dayOfMonth(w[6]!)}/${parseDateKey(w[6]!).getMonth() + 1}`
          })()
        : view === 'MONTH'
          ? `${monthName(cursor)} de ${parseDateKey(cursor).getFullYear()}`
          : 'Sem data definida'

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <Title anchor="Agenda e tarefas," rest="no tempo certo." />
        <Button variant="primary" size="compact" icon={CalendarPlus} onClick={() => ui.openSheet('event', { date: view === 'INBOX' ? today : cursor })} data-testid="agenda-new-event">
          Compromisso
        </Button>
      </div>
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="w-full lg:w-auto">
        <Segmented<View>
          label="Visão da agenda"
          value={view}
          onChange={setView}
          size="sm"
          stretch
          options={[
            { value: 'DAY', label: 'Dia', testId: 'agenda-DAY' },
            { value: 'WEEK', label: 'Semana', testId: 'agenda-WEEK' },
            { value: 'MONTH', label: 'Mês', testId: 'agenda-MONTH' },
            { value: 'INBOX', label: 'Caixa de Entrada', shortLabel: 'Entrada', testId: 'agenda-INBOX', ariaLabel: 'Caixa de Entrada' },
          ]}
        />
        </div>
        <Segmented<ScopeFilter>
          label="Filtrar por pessoa"
          value={scope}
          onChange={setScope}
          size="sm"
          stretch
          options={[
            { value: 'ALL', label: 'Todos' },
            { value: 'MINE', label: 'Meu' },
            { value: 'PARTNER', label: possessive(partner) },
            { value: 'US', label: 'Nós' },
          ]}
        />
      </div>

      {view !== 'INBOX' ? (
        <div className="mb-4 flex items-center gap-2">
          <button type="button" onClick={() => move(-1)} aria-label="Período anterior" className="press hoverable inline-flex h-12 w-12 items-center justify-center rounded-full border border-line text-ink">
            <ChevronLeft size={20} aria-hidden />
          </button>
          <p className="min-w-0 flex-1 text-center text-[15px] font-semibold text-ink first-letter:uppercase" aria-live="polite">
            {rangeLabel}
          </p>
          <button type="button" onClick={() => move(1)} aria-label="Próximo período" className="press hoverable inline-flex h-12 w-12 items-center justify-center rounded-full border border-line text-ink">
            <ChevronRight size={20} aria-hidden />
          </button>
          {cursor !== today ? (
            <Button size="sm" variant="quiet" onClick={() => setCursor(today)}>
              Hoje
            </Button>
          ) : null}
        </div>
      ) : null}

      {view === 'DAY' ? <DayView day={cursor} today={today} {...data} /> : null}
      {view === 'WEEK' ? <WeekView day={cursor} today={today} {...data} /> : null}
      {view === 'MONTH' ? <MonthView day={cursor} today={today} onPick={setCursor} {...data} /> : null}
      {view === 'INBOX' ? <InboxView tasks={inboxTasks(data.tasks)} /> : null}
    </div>
  )
}

interface ViewData {
  tasks: ReturnType<typeof filterTasks>
  events: CalendarEvent[]
  bills: Transaction[]
  meds: Medication[]
  marks: DayMark[]
}

const MARK_ICON: Record<MarkKind, { icon: LucideIcon; cls: string }> = {
  SPECIAL: { icon: Heart, cls: 'text-couple' },
  PERIOD: { icon: Droplet, cls: 'text-partner-b' },
  CARE: { icon: HeartHandshake, cls: 'text-muted' },
}

/** Marca do dia (data especial, menstruação, semana de cuidado): ícone + texto, borda tracejada (é previsão) */
function MarkRow({ m, compact }: { m: DayMark; compact?: boolean }) {
  const { icon: Icon, cls } = MARK_ICON[m.kind]
  return (
    <p className={cx('ledger-dashed flex min-w-0 items-center gap-2 rounded-[12px] text-ink', compact ? 'px-2 py-1.5 text-[13px]' : 'bg-surface p-3 text-[14px] font-semibold')} data-testid="day-mark" data-kind={m.kind}>
      <Icon size={compact ? 14 : 16} aria-hidden className={cx('shrink-0', cls)} />
      <span className="min-w-0 break-words">{m.label}</span>
    </p>
  )
}

function EventRow({ e }: { e: CalendarEvent }) {
  const { viewer, partner } = usePeople()
  const kind = e.kind === 'HEALTH' ? 'Saúde / remédio' : e.kind === 'BILL' ? 'Conta que vence' : 'Compromisso'
  return (
    <div className="flex items-start gap-3 rounded-[16px] border border-line bg-surface p-3" data-testid="event-row">
      <div className="min-w-0 flex-1">
        <p className="font-data text-[13px] text-muted">
          {e.start} a {e.end}
        </p>
        <p className="text-[15px] font-semibold break-words text-ink">{e.title}</p>
        <div className="mt-0.5 flex flex-wrap gap-x-3">
          <OwnerTag tone={toneOf(e.ownerId)}>{ownerLabel(e.ownerId, viewer, partner)}</OwnerTag>
          <span className="text-[12px] text-muted">{kind}</span>
        </div>
      </div>
      <span className="-my-2 -mr-2">
        <EditButton label={`Editar compromisso ${e.title}`} onClick={() => ui.openSheet('event', { id: e.id })} testId="event-edit" />
      </span>
    </div>
  )
}

function DayView({ day, today, tasks, events, bills, meds, marks }: ViewData & { day: DateKey; today: DateKey }) {
  const dayMarks = marks.filter((m) => m.date === day)
  const dayTasks = tasksForDay(tasks, day)
  const untimed = dayTasks.filter((t) => !t.dueTime)
  const dayEvents = events.filter((e) => e.date === day)
  const dayBills = bills.filter((b) => b.competenceDate === day)
  const doses = meds.filter((m) => isScheduledOn(m, day)).flatMap((m) => m.times.map((t) => ({ m, t })))
  const hours = Array.from({ length: 17 }, (_, i) => i + 7)
  const hh = (t: string) => Number(t.slice(0, 2))

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
      <section aria-labelledby="sem-horario" className="min-w-0">
        {dayMarks.length ? (
          <div className="mb-3 flex flex-col gap-2" aria-label="Neste dia">
            {dayMarks.map((m) => (
              <MarkRow key={`${m.kind}${m.owner}`} m={m} />
            ))}
          </div>
        ) : null}
        <h2 id="sem-horario" className="mb-2 text-[15px] font-bold text-ink">
          Demandas do dia <span className="font-medium text-muted">· sem horário fixo</span>
        </h2>
        {untimed.length === 0 && dayBills.length === 0 ? (
          <EmptyState
            icon={Sun}
            title="Dia leve."
            text={day === today ? 'Nada solto para hoje. Respira.' : 'Nada marcado para este dia ainda.'}
            action={
              <Button variant="quiet" icon={ListPlus} onClick={() => ui.openSheet('task')}>
                Adicionar tarefa
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {untimed.map((t) => (
              <TaskRow key={t.id} task={t} actions={['postpone', 'send', 'help']} />
            ))}
            {dayBills.map((b) => (
              <li key={b.id} className="ledger-dashed flex items-center justify-between gap-2 rounded-[16px] bg-surface p-3">
                <span className="text-[15px] font-semibold text-ink">Vence: {b.description}</span>
                <StatusBadge kind="pending">
                  <span className="font-data whitespace-nowrap">{formatCents(b.amountCents)}</span> previsto
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="linha-tempo" className="min-w-0">
        <h2 id="linha-tempo" className="mb-2 text-[15px] font-bold text-ink">
          Linha do tempo <span className="font-medium text-muted">· 07:00 às 23:00</span>
        </h2>
        <ol className="rounded-[20px] border border-line bg-surface">
          {hours.map((h) => {
            const evs = dayEvents.filter((e) => hh(e.start) === h)
            const ds = doses.filter((d) => hh(d.t) === h)
            const ts = dayTasks.filter((t) => t.dueTime && hh(t.dueTime) === h)
            const empty = evs.length + ds.length + ts.length === 0
            return (
              <li key={h} className={cx('flex gap-3 border-b border-line px-3 last:border-b-0', empty ? 'py-1.5' : 'py-2.5')}>
                <span className="font-data w-12 shrink-0 pt-0.5 text-[13px] text-muted">{String(h).padStart(2, '0')}:00</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {evs.map((e) => (
                    <EventRow key={e.id} e={e} />
                  ))}
                  {ds.map(({ m, t }) => (
                    <p key={`${m.id}${t}`} className="ledger-dashed rounded-[14px] px-3 py-2 text-[14px] text-ink">
                      <span className="font-data text-muted">{t}</span> · {m.name} <span className="text-muted">({m.kind === 'ROUTINE' ? 'rotina' : 'remédio'})</span>
                    </p>
                  ))}
                  {ts.map((t) => (
                    <p key={t.id} className="rounded-[14px] border border-line px-3 py-2 text-[14px] text-ink">
                      <span className="font-data text-muted">{t.dueTime}</span> · {t.title}
                    </p>
                  ))}
                </div>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

const LOAD: Record<DayLoad, { bars: number; label: string; cls: string }> = {
  LEVE: { bars: 1, label: 'Leve', cls: 'text-ok' },
  MODERADA: { bars: 2, label: 'Moderada', cls: 'text-warn' },
  ALTA: { bars: 3, label: 'Alta', cls: 'text-err' },
}

function LoadMeter({ load }: { load: DayLoad }) {
  const L = LOAD[load]
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[12px] font-bold', L.cls)} aria-label={`Carga do dia: ${L.label}`}>
      <span aria-hidden className="flex items-end gap-0.5">
        {[1, 2, 3].map((n) => (
          <span key={n} className={cx('w-1.5 rounded-sm', n <= L.bars ? 'bg-current' : 'border border-current')} style={{ height: 4 + n * 4 }} />
        ))}
      </span>
      {L.label}
    </span>
  )
}

function WeekView({ day, today, tasks, events, bills, marks }: ViewData & { day: DateKey; today: DateKey }) {
  const { viewer } = usePeople()
  const days = weekDays(day)
  return (
    <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7 2xl:gap-2">
      {days.map((d) => {
        const ts = tasksForDay(tasks, d)
        const evs = events.filter((e) => e.date === d).sort((a, b) => a.start.localeCompare(b.start))
        const bs = bills.filter((b) => b.competenceDate === d)
        const { load } = dayLoad(ts, evs, bs, d)
        return (
          <li key={d} className={cx('card flex min-w-0 flex-col gap-2 p-3', d === today && 'ring-2 ring-action')} data-testid="week-day">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <p className="min-w-0 text-[14px] font-bold text-ink">
                {weekdayShort(d)} <span className="font-data text-muted">{dayOfMonth(d)}</span>
                {d === today ? <span className="ml-1 text-[12px] font-semibold text-action">hoje</span> : null}
              </p>
              <LoadMeter load={load} />
            </div>
            {marks
              .filter((m) => m.date === d)
              .map((m) => (
                <MarkRow key={`${m.kind}${m.owner}`} m={m} compact />
              ))}
            {evs.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => ui.openSheet('event', { id: e.id })}
                aria-label={`Editar compromisso ${e.title}, ${e.start}`}
                className="press hoverable min-h-11 min-w-0 rounded-[12px] bg-subtle px-2 py-1.5 text-left text-[13px] break-words text-ink"
              >
                <span className="font-data text-muted">{e.start}</span> {e.title}
              </button>
            ))}
            {bs.map((b) => (
              <p key={b.id} className="ledger-dashed min-w-0 rounded-[12px] px-2 py-1.5 text-[13px] break-words text-ink">
                Vence {b.description} · <span className="font-data whitespace-nowrap">{formatCents(b.amountCents)}</span>
              </p>
            ))}
            <ul className="flex flex-col gap-2 lg:hidden">
              {ts.map((t) => (
                <TaskRow key={t.id} task={t} actions={['postpone', 'send']} />
              ))}
            </ul>
            <ul className="hidden flex-col gap-1 lg:flex">
              {ts.map((t) => (
                <li key={t.id} data-testid="week-task" className={cx('min-w-0 rounded-[12px] px-1 text-[13px]', t.status === 'DONE' ? 'ledger-ok pb-1' : 'border border-line')}>
                  {/* Concluir/reabrir: CircleDashed (pendente) ou CircleCheck + "Feita" + traço sólido (regra 3) */}
                  <span className="flex min-w-0 items-start">
                    <button
                      type="button"
                      aria-pressed={t.status === 'DONE'}
                      onClick={() => toggleTask(t.id)}
                      aria-label={t.status === 'DONE' ? `Reabrir: ${t.title}` : `Concluir: ${t.title}`}
                      title={t.status === 'DONE' ? 'Reabrir' : 'Concluir'}
                      data-testid="week-task-toggle"
                      className={cx('press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px]', t.status === 'DONE' ? 'text-ok' : 'hoverable text-muted')}
                    >
                      {t.status === 'DONE' ? <CircleCheck size={20} aria-hidden /> : <CircleDashed size={20} aria-hidden />}
                    </button>
                    <span className="min-w-0 flex-1 py-3 leading-snug break-words">
                      <span className={t.status === 'DONE' ? 'text-muted line-through' : 'text-ink'}>{t.title}</span>
                      {t.status === 'DONE' ? <span className="block text-[12px] font-semibold text-ok">Feita</span> : null}
                    </span>
                  </span>
                  {t.status === 'PENDING' ? (
                    <span className="flex">
                      <button
                        type="button"
                        onClick={() => postponeTask(t.id)}
                        aria-label={`Adiar para amanhã: ${t.title}`}
                        title="Adiar para amanhã"
                        className="press hoverable inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-action"
                      >
                        <MoveRight size={16} aria-hidden />
                      </button>
                      {t.assignedTo === viewer ? (
                        <button
                          type="button"
                          onClick={() => sendTaskToPartner(t.id)}
                          aria-label={`Enviar para meu amor: ${t.title}`}
                          title="Enviar para meu amor"
                          className="press hoverable inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-action"
                        >
                          <Mail size={16} aria-hidden />
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {ts.length + evs.length + bs.length === 0 ? <p className="text-[13px] text-muted">Livre</p> : null}
          </li>
        )
      })}
    </ol>
  )
}

function MonthView({ day, today, onPick, tasks, events, bills, marks }: ViewData & { day: DateKey; today: DateKey; onPick: (d: DateKey) => void }) {
  const selectedMarks = marks.filter((m) => m.date === day)
  const grid = monthGrid(day)
  const month = parseDateKey(day).getMonth()
  const selectedEvents = events.filter((e) => e.date === day).sort((a, b) => a.start.localeCompare(b.start))
  const selectedBills = bills.filter((b) => b.competenceDate === day)
  const selectedTasks = tasksForDay(tasks, day)
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
      <div>
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted" aria-label="Legenda">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-couple" /> Compromisso
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg aria-hidden width="11" height="10" viewBox="0 0 11 10" className="text-warn">
              <path d="M5.5 0L11 10H0z" fill="currentColor" />
            </svg>
            Conta que vence
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 bg-partner-a" /> Saúde / remédio
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Heart size={11} aria-hidden className="text-couple" /> Data especial
          </span>
          {marks.some((m) => m.kind === 'PERIOD') ? (
            <span className="inline-flex items-center gap-1.5">
              <Droplet size={11} aria-hidden className="text-partner-b" /> Menstruação
            </span>
          ) : null}
          {marks.some((m) => m.kind === 'CARE') ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-3 bg-muted" /> Semana de mais cuidado
            </span>
          ) : null}
        </div>
        <div role="grid" aria-label={`Calendário de ${monthName(day)}`} className="grid grid-cols-7 gap-1">
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((w, i) => (
            <span key={i} role="columnheader" className="pb-1 text-center text-[12px] font-bold text-muted">
              {w}
            </span>
          ))}
          {grid.map((d) => {
            const inMonth = parseDateKey(d).getMonth() === month
            const couple = events.some((e) => e.date === d && (e.kind === 'COUPLE' || e.kind === 'PERSONAL'))
            const bill = bills.some((b) => b.competenceDate === d) || events.some((e) => e.date === d && e.kind === 'BILL')
            const health = events.some((e) => e.date === d && e.kind === 'HEALTH')
            const dm = marks.filter((m) => m.date === d)
            const special = dm.some((m) => m.kind === 'SPECIAL')
            const period = dm.some((m) => m.kind === 'PERIOD')
            const care = dm.some((m) => m.kind === 'CARE')
            const marksLabel = [couple && 'compromisso', bill && 'conta vence', health && 'saúde', ...dm.map((m) => m.label.toLowerCase())].filter(Boolean).join(', ')
            const selected = d === day
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                aria-selected={selected}
                aria-label={`${dayOfMonth(d)} de ${monthName(d)}${marksLabel ? `: ${marksLabel}` : ''}`}
                onClick={() => onPick(d)}
                className={cx(
                  'press flex min-h-12 flex-col items-center justify-start gap-1 rounded-[12px] pt-1.5 text-[14px] sm:min-h-16',
                  selected ? 'bg-action text-on-action' : d === today ? 'bg-selected text-ink' : inMonth ? 'text-ink hoverable' : 'text-muted opacity-60',
                )}
              >
                <span className="font-data">{dayOfMonth(d)}</span>
                <span aria-hidden className="flex h-2.5 items-center gap-0.5">
                  {couple ? <span className={cx('h-2 w-2 rounded-full', selected ? 'bg-on-action' : 'bg-couple')} /> : null}
                  {bill ? (
                    <svg width="9" height="8" viewBox="0 0 11 10" className={selected ? 'text-on-action' : 'text-warn'}>
                      <path d="M5.5 0L11 10H0z" fill="currentColor" />
                    </svg>
                  ) : null}
                  {health ? <span className={cx('h-2 w-2', selected ? 'bg-on-action' : 'bg-partner-a')} /> : null}
                  {special ? <Heart size={9} className={selected ? 'text-on-action' : 'text-couple'} /> : null}
                  {period ? <Droplet size={9} className={selected ? 'text-on-action' : 'text-partner-b'} /> : null}
                </span>
                {care ? <span aria-hidden className={cx('h-0.5 w-3', selected ? 'bg-on-action' : 'bg-muted')} /> : null}
              </button>
            )
          })}
        </div>
      </div>
      <section aria-labelledby="dia-sel" className="min-w-0">
        <h2 id="dia-sel" className="mb-2 text-[16px] font-bold text-ink first-letter:uppercase">
          {relativeDayLabel(day, today)} · {dayOfMonth(day)} de {monthName(day)}
        </h2>
        {selectedMarks.length ? (
          <div className="mb-2 flex flex-col gap-2">
            {selectedMarks.map((m) => (
              <MarkRow key={`${m.kind}${m.owner}`} m={m} />
            ))}
          </div>
        ) : null}
        {selectedEvents.length + selectedBills.length + selectedTasks.length === 0 ? (
          selectedMarks.length ? null : <p className="rounded-[18px] border border-dashed border-line-strong p-4 text-[14px] text-muted">Nada marcado neste dia.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {selectedEvents.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
            {selectedBills.map((b) => (
              <div key={b.id} className="ledger-dashed flex items-center justify-between gap-2 rounded-[16px] bg-surface p-3">
                <span className="text-[15px] font-semibold text-ink">Vence: {b.description}</span>
                <StatusBadge kind="pending">
                  <span className="font-data whitespace-nowrap">{formatCents(b.amountCents)}</span> previsto
                </StatusBadge>
              </div>
            ))}
            <ul className="flex flex-col gap-2">
              {selectedTasks.map((t) => (
                <TaskRow key={t.id} task={t} actions={['postpone', 'send']} />
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}

function InboxView({ tasks }: { tasks: ReturnType<typeof inboxTasks> }) {
  const { viewer, partner } = usePeople()
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Caixa de Entrada vazia."
        text="Tudo o que você anotar sem data aparece aqui para decidir depois, com calma."
        action={
          <Button variant="quiet" icon={ListPlus} onClick={() => ui.openSheet('task')}>
            Anotar algo
          </Button>
        }
      />
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((t) => (
        <li key={t.id} className="card flex flex-wrap items-center gap-2 p-3">
          <div className="min-w-0 grow basis-[200px]">
            <p className="text-[15px] font-semibold text-ink">{t.title}</p>
            <OwnerTag tone={toneOf(t.assignedTo)}>{ownerLabel(t.assignedTo, viewer, partner)}</OwnerTag>
          </div>
          <Button size="sm" variant="quiet" onClick={() => scheduleTaskToday(t.id)}>
            Trazer para hoje
          </Button>
          {t.assignedTo === viewer ? (
            <Button size="sm" variant="ghost" onClick={() => sendTaskToPartner(t.id)}>
              Enviar para meu amor
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
