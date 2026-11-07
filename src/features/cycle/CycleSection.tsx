import { CalendarHeart, CloudRain, Droplet, HeartHandshake, Leaf, Lock, Plus, Sprout, Sun, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Button, cx, EditButton, SectionHeader, Segmented, StatusBadge, Switch } from '../../components/ui'
import {
  cycleToday,
  daysBetween,
  defaultCycleSettings,
  logsOf,
  partnerCycleView,
  PHASE_HINT,
  PHASE_LABEL,
  shouldWarnPartner,
  upcomingPeriods,
  type CyclePhase,
  type PartnerCycleView,
} from '../../domain/cycle'
import { toDateKey } from '../../domain/dates'
import { plural } from '../../domain/format'
import type { CycleShare, PartnerId, Profile } from '../../domain/types'
import { setEnergy } from '../../store/actions'
import { createStore, useStore } from '../../store/createStore'
import { endPeriodToday, updateCycleSettings } from '../../store/cycleActions'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { ui } from '../../store/ui'

const PHASE_ICON: Record<CyclePhase, LucideIcon> = {
  MENSTRUAL: Droplet,
  FOLLICULAR: Sprout,
  OVULATION: Sun,
  LUTEAL: Leaf,
  PREMENSTRUAL: CloudRain,
  LATE: CalendarHeart,
}

/** "29/11" em fonte de dados, sem quebrar */
function Day({ d }: { d: string }) {
  return (
    <span className="font-data whitespace-nowrap">
      {d.slice(8, 10)}/{d.slice(5, 7)}
    </span>
  )
}

const inDays = (n: number) => (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`)

/** Ciclo da pessoa logada + o que o par compartilhou. Mora na aba Cuidados. */
export function CycleSection() {
  const today = toDateKey(useNow())
  const { viewer, partnerId, partner } = usePeople()
  const allLogs = useData((s) => s.cycleLogs)
  const allSettings = useData((s) => s.cycleSettings)

  const d = useMemo(() => {
    const settings = allSettings[viewer] ?? defaultCycleSettings(viewer, '')
    const mine = logsOf(Object.values(allLogs), viewer)
    return {
      started: !!allSettings[viewer] || mine.length > 0,
      settings,
      mine,
      cycle: cycleToday(mine, settings, today),
      upcoming: upcomingPeriods(mine, settings, today, 3),
      partnerView: partnerCycleView(Object.values(allLogs), allSettings, partnerId, viewer, today),
    }
  }, [allLogs, allSettings, viewer, partnerId, today])

  return (
    <section aria-labelledby="ciclo-title" data-testid="cycle-section">
      <SectionHeader
        id="ciclo-title"
        title="Ciclo"
        rest="· você decide quem vê"
        action={
          d.started && !(d.cycle?.inPeriod && d.cycle.current.endDate === null) ? (
            <Button size="sm" variant="quiet" icon={Droplet} onClick={() => ui.openSheet('period')} data-testid="period-add">
              Menstruação começou
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-3">
        {d.partnerView.status !== 'hidden' ? <PartnerCycleCard view={d.partnerView} partner={partner} today={today} /> : null}
        {!d.started ? (
          <div className="card ledger-dashed p-4" data-testid="cycle-intro">
            <p className="flex items-center gap-2 text-[15px] font-bold text-ink">
              <CalendarHeart size={18} aria-hidden className="text-couple" /> Acompanhar ciclo menstrual
            </p>
            <p className="mt-1 text-[14px] text-muted">
              Opcional, para quem menstrua. Prevê a próxima menstruação e avisa a semana em que o foco e a paciência costumam cair, que é
              quando o TDAH mais pesa.
            </p>
            <Button variant="quiet" icon={Plus} className="mt-3" onClick={() => ui.openSheet('period')} data-testid="cycle-start">
              Registrar menstruação
            </Button>
          </div>
        ) : (
          <>
            <MyCycleCard cycle={d.cycle} upcoming={d.upcoming} today={today} />
            <ShareCard share={d.settings.share} suggestCalm={d.settings.suggestCalm} partnerName={partner.displayName} />
            {d.mine.length ? (
              <div className="card p-4">
                <h3 className="text-[15px] font-bold text-ink">Registros</h3>
                <ul className="mt-1 divide-y divide-line">
                  {d.mine.slice(0, 6).map((l) => {
                    const len = l.endDate ? daysBetween(l.startDate, l.endDate) + 1 : null
                    return (
                      <li key={l.id} className="flex items-center justify-between gap-2 py-1" data-testid="period-row">
                        <p className="text-[14px] text-ink">
                          <Day d={l.startDate} />
                          {l.endDate ? (
                            <>
                              {' a '}
                              <Day d={l.endDate} />
                              <span className="text-muted"> · {plural(len!, 'dia', 'dias')}</span>
                            </>
                          ) : (
                            <span className="text-muted"> · fim não marcado</span>
                          )}
                        </p>
                        <EditButton label={`Corrigir registro de ${l.startDate.slice(8, 10)}/${l.startDate.slice(5, 7)}`} onClick={() => ui.openSheet('period', { id: l.id })} testId="period-edit" />
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

function MyCycleCard({ cycle, upcoming, today }: { cycle: ReturnType<typeof cycleToday>; upcoming: { start: string; end: string }[]; today: string }) {
  if (!cycle) {
    return (
      <div className="card ledger-dashed p-4" data-testid="cycle-card">
        <p className="text-[15px] font-semibold text-ink">Sem registro recente.</p>
        <p className="mt-1 text-[14px] text-muted">Quando a próxima menstruação vier, toque em “Menstruação começou”.</p>
      </div>
    )
  }
  const Icon = PHASE_ICON[cycle.phase]
  const late = -cycle.daysUntilNext
  const openPeriod = cycle.inPeriod && cycle.current.endDate === null
  return (
    <div className="module ledger-solid p-4 sm:p-5" data-testid="cycle-card" data-phase={cycle.phase}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-subtle text-ink">
          <Icon size={22} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted">
            Dia <span className="font-data text-ink">{cycle.day}</span> do ciclo
          </p>
          <p className="text-[18px] leading-tight font-bold text-ink">{PHASE_LABEL[cycle.phase]}</p>
        </div>
      </div>
      <p className="mt-2 text-[14px] text-muted">{PHASE_HINT[cycle.phase]}</p>
      {cycle.phase === 'LATE' ? (
        <StatusBadge kind="pending" className="mt-2">
          {plural(late, 'dia', 'dias')} depois do previsto
        </StatusBadge>
      ) : null}
      {openPeriod ? (
        <Button variant="primary" className="mt-3 w-full sm:w-auto" onClick={() => endPeriodToday(cycle.current.id)} data-testid="period-end-today">
          Terminou hoje
        </Button>
      ) : null}
      <dl className="mt-3 grid gap-2 border-t border-line pt-3 text-[14px]">
        {cycle.phase !== 'LATE' ? (
          <div className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-muted">Próxima menstruação</dt>
            <dd className="font-semibold text-ink">
              <Day d={cycle.nextStart} /> <span className="font-medium text-muted">({inDays(cycle.daysUntilNext)})</span>
            </dd>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-between gap-x-3">
          <dt className="text-muted">Semana de mais cuidado</dt>
          <dd className="font-semibold text-ink">
            <Day d={cycle.sensitiveFrom} /> a <Day d={cycle.sensitiveTo} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-x-3">
          <dt className="text-muted">
            {cycle.stats.basedOn >= 1 ? `Média (${plural(cycle.stats.basedOn + 1, 'registro', 'registros')})` : 'Duração'}
          </dt>
          <dd className="flex shrink-0 items-center font-semibold text-ink">
            <span className="whitespace-nowrap">
              <span className="font-data">{cycle.stats.cycleDays}</span> d, fluxo <span className="font-data">{cycle.stats.periodDays}</span> d
            </span>
            <EditButton label="Ajustar duração do ciclo" onClick={() => ui.openSheet('cycleSetup')} testId="cycle-setup" />
          </dd>
        </div>
      </dl>
      {upcoming.length ? (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Próximas menstruações previstas">
          {upcoming.map((u) => (
            <li key={u.start} className="ledger-dashed rounded-[12px] px-2.5 py-1 text-[13px] text-muted">
              Prevista <Day d={u.start} />
              {u.start === today ? ' (a qualquer momento)' : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const SHARE_TEXT: Record<CycleShare, (p: string) => string> = {
  NONE: (p) => `${p} não vê nada do seu ciclo.`,
  GENTLE: (p) => `${p} vê só a semana de mais cuidado, sem as datas da menstruação. Ela termina perto do início da próxima.`,
  FULL: (p) => `${p} vê a fase do ciclo, as datas previstas e os registros.`,
}

function ShareCard({ share, suggestCalm, partnerName }: { share: CycleShare; suggestCalm: boolean; partnerName: string }) {
  return (
    <div className="card p-4" data-testid="cycle-share">
      <p className="mb-2 flex items-center gap-2 text-[15px] font-bold text-ink">
        <Lock size={16} aria-hidden className="text-muted" /> Quem vê
      </p>
      <Segmented<CycleShare>
        label={`O que ${partnerName} vê do seu ciclo`}
        value={share}
        onChange={(v) => updateCycleSettings({ share: v })}
        stretch
        size="sm"
        options={[
          { value: 'NONE', label: 'Só eu vejo', shortLabel: 'Só eu', testId: 'cycle-share-NONE' },
          { value: 'GENTLE', label: 'Só o aviso', shortLabel: 'Aviso', testId: 'cycle-share-GENTLE' },
          { value: 'FULL', label: 'Tudo', testId: 'cycle-share-FULL' },
        ]}
      />
      <p className="mt-2 text-[13px] text-muted" data-testid="cycle-share-text">
        {SHARE_TEXT[share](partnerName)}
      </p>
      <div className="mt-3 border-t border-line pt-3">
        <Switch
          checked={suggestCalm}
          onChange={(v) => updateCycleSettings({ suggestCalm: v })}
          testId="cycle-suggest-calm"
          label="Sugerir pegar mais leve"
          description="Na semana de mais cuidado, o Hoje sugere a Bateria em 50%. Nada muda sem você tocar."
        />
      </div>
    </div>
  )
}

function PartnerCycleCard({ view, partner, today }: { view: Exclude<PartnerCycleView, { status: 'hidden' }>; partner: Profile; today: string }) {
  const to = view.status === 'gentle' ? view.to : view.cycle.daysUntilNext < 0 ? today : view.cycle.sensitiveTo
  return (
    <div className={cx('card p-4', view.active ? 'ledger-solid' : 'ledger-dashed')} data-testid="partner-cycle">
      <p className="flex items-center gap-2 text-[15px] font-bold text-ink">
        <HeartHandshake size={18} aria-hidden className="text-couple" /> Ciclo de {partner.displayName}
      </p>
      {view.status === 'full' ? (
        <p className="mt-1 text-[14px] text-ink">
          Dia <span className="font-data">{view.cycle.day}</span> · {PHASE_LABEL[view.cycle.phase]}
          {view.cycle.phase !== 'LATE' ? (
            <span className="text-muted">
              {' '}
              · próxima <Day d={view.cycle.nextStart} />
            </span>
          ) : null}
        </p>
      ) : null}
      <p className="mt-1 text-[14px] text-muted">
        {view.active ? (
          <>
            Semana de mais cuidado até <Day d={to} />.
          </>
        ) : view.startsIn > 0 ? (
          <>
            Semana de mais cuidado começa <Day d={view.status === 'gentle' ? view.from : view.cycle.sensitiveFrom} /> ({inDays(view.startsIn)}).
          </>
        ) : (
          'Fora da semana de mais cuidado.'
        )}
      </p>
    </div>
  )
}

/* ---------- cartões do Hoje ---------- */

/** "Hoje não" vale até recarregar o app (em memória: nem a data vai para o armazenamento em claro) */
const dismissed = createStore<Record<string, true>>({})

export function CycleTodayCards() {
  const today = toDateKey(useNow())
  const { viewer, partnerId, me, partner } = usePeople()
  const allLogs = useData((s) => s.cycleLogs)
  const allSettings = useData((s) => s.cycleSettings)
  const hidden = useStore(dismissed, (s) => s)

  const d = useMemo(() => {
    const settings = allSettings[viewer]
    const cycle = settings ? cycleToday(logsOf(Object.values(allLogs), viewer), settings, today) : null
    return {
      settings,
      cycle,
      partnerView: partnerCycleView(Object.values(allLogs), allSettings, partnerId, viewer, today),
    }
  }, [allLogs, allSettings, viewer, partnerId, today])

  const sensitive = d.cycle && (d.cycle.phase === 'PREMENSTRUAL' || d.cycle.phase === 'LATE' || (d.cycle.phase === 'MENSTRUAL' && d.cycle.day <= 2))
  const suggest = !!(sensitive && d.settings?.suggestCalm && me.energy === 'FULL' && !hidden[`${viewer}@${today}`])
  const warn = shouldWarnPartner(d.partnerView)

  return (
    <>
      {suggest && d.cycle ? (
        <section className="module ledger-dashed p-4 sm:p-5" data-testid="cycle-suggest" aria-label="Sugestão do ciclo">
          <p className="flex items-center gap-2 text-[13px] font-bold text-couple">
            <CloudRain size={16} aria-hidden /> {PHASE_LABEL[d.cycle.phase]} · dia <span className="font-data">{d.cycle.day}</span>
          </p>
          <p className="mt-2 text-[16px] font-semibold text-ink">Quer deixar a Bateria Mental em 50% hoje?</p>
          <p className="mt-1 text-[14px] text-muted">{PHASE_HINT[d.cycle.phase]}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => setEnergy('MEDIUM')} data-testid="cycle-suggest-accept">
              Deixar em 50%
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dismissed.set((s) => ({ ...s, [`${viewer}@${today}`]: true }))}>
              Hoje não
            </Button>
          </div>
        </section>
      ) : null}
      {warn && d.partnerView.status !== 'hidden' ? <PartnerWarn view={d.partnerView} partner={partner} pid={partnerId} today={today} /> : null}
    </>
  )
}

function PartnerWarn({ view, partner, today }: { view: Exclude<PartnerCycleView, { status: 'hidden' }>; partner: Profile; pid: PartnerId; today: string }) {
  const to = view.status === 'gentle' ? view.to : view.cycle.daysUntilNext < 0 ? today : view.cycle.sensitiveTo
  return (
    <section className={cx('module p-4 sm:p-5', view.active ? 'ledger-solid' : 'ledger-dashed')} data-testid="partner-cycle-warn" aria-label={`Semana de mais cuidado de ${partner.displayName}`}>
      <p className="flex items-center gap-2 text-[13px] font-bold text-couple">
        <HeartHandshake size={16} aria-hidden /> Semana de mais cuidado
      </p>
      <p className="mt-2 text-[16px] font-semibold text-ink">
        {view.active ? (
          <>
            {partner.displayName} está na semana de mais cuidado, até <Day d={to} />.
          </>
        ) : (
          <>A semana de mais cuidado de {partner.displayName} começa {inDays(view.startsIn)}.</>
        )}
      </p>
      <p className="mt-1 text-[14px] text-muted">Mais paciência e menos cobrança. Assumir uma tarefa ou levar um chá costuma ajudar.</p>
    </section>
  )
}
