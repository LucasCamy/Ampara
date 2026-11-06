import { HandHeart, Package, Pill, Plus, Repeat } from 'lucide-react'
import { useMemo } from 'react'
import { DoseActions, DoseStatus, doseBorder } from '../../components/domain'
import { Button, cx, EditButton, EmptyState, OwnerTag, SectionHeader, StatusBadge, Switch, Title } from '../../components/ui'
import { toDateKey } from '../../domain/dates'
import { formatClock } from '../../domain/format'
import { isLowStock, stockDaysLeft, stockLevel, stockRunsOutOn } from '../../domain/medication'
import { dosesFor, partnerSupportedDoses, type DoseItem } from '../../domain/today'
import type { Medication } from '../../domain/types'
import { restock, sendNudge, setPartnerSupport } from '../../store/actions'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { toneOf, usePeople } from '../../store/hooks'
import { ui } from '../../store/ui'
import { CycleSection } from '../cycle/CycleSection'

const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function RoutinesScreen() {
  const now = useNow()
  const today = toDateKey(now)
  const { viewer, partner, profiles } = usePeople()
  const state = useData((s) => s)

  const d = useMemo(() => {
    const doses = dosesFor(state, viewer, today, now)
    const meds = Object.values(state.meds)
    const lastDone = new Map<string, { by: string; at: string }>()
    for (const log of Object.values(state.medLogs)) {
      if (log.status !== 'TAKEN' || !log.takenAt) continue
      const prev = lastDone.get(log.medicationId)
      if (!prev || prev.at < log.takenAt) lastDone.set(log.medicationId, { by: log.confirmedBy ?? '', at: log.takenAt })
    }
    return {
      myDoses: doses.filter((x) => x.med.kind === 'MED'),
      routineDoses: doses.filter((x) => x.med.kind === 'ROUTINE'),
      myMeds: meds.filter((m) => m.ownerId === viewer && m.kind === 'MED'),
      routines: meds.filter((m) => m.ownerId === null),
      partnerDoses: partnerSupportedDoses(state, viewer, today, now),
      nudged: new Set(Object.values(state.nudges).filter((n) => n.from === viewer).map((n) => n.medicationLogId)),
      lastDone,
    }
  }, [state, viewer, today, now])

  return (
    <div>
      <div className="mb-5">
        <Title anchor="Remédios e rotinas," rest="sem cegueira de alarme." />
        <p className="mt-2 max-w-[60ch] text-[14px] text-muted">
          Confirme em dois estágios: <strong className="text-ink">Já engoli</strong> registra o horário exato.{' '}
          <strong className="text-ink">Pegando água</strong> segura a lembrança por 5 minutos.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="meds-hoje">
          <SectionHeader
            id="meds-hoje"
            title="Medicamentos de hoje"
            rest={`· ${d.myDoses.filter((x) => x.view === 'TAKEN').length} de ${d.myDoses.length} tomados`}
            action={
              <Button size="sm" variant="quiet" icon={Plus} onClick={() => ui.openSheet('newMed')} data-testid="add-med">
                Novo remédio
              </Button>
            }
          />
          {d.myDoses.length === 0 ? (
            <EmptyState
              icon={Pill}
              title="Nenhum remédio hoje."
              text="Cadastre o primeiro: nome, dose e horário. A confirmação em dois estágios e o estoque já vêm prontos."
              action={
                <Button variant="primary" icon={Plus} onClick={() => ui.openSheet('newMed')} data-testid="add-med-empty">
                  Cadastrar remédio
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {d.myDoses.map((dose) => (
                <DoseCard key={dose.log.id} dose={dose} now={now} />
              ))}
            </ul>
          )}

          {d.myMeds.length ? (
            <>
              <h3 className="mt-6 mb-2 text-[15px] font-bold text-ink">Estoque e rede de apoio</h3>
              <ul className="flex flex-col gap-3">
                {d.myMeds.map((m) => (
                  <MedSettings key={m.id} med={m} partnerName={partner.displayName} />
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="rotinas-casa">
            <SectionHeader
              id="rotinas-casa"
              title="Rotinas da casa"
              rest="· qualquer um confirma"
              action={
                <Button size="sm" variant="quiet" icon={Plus} onClick={() => ui.openSheet('routine')} data-testid="add-routine">
                  Nova rotina
                </Button>
              }
            />
            {d.routines.length === 0 ? (
              <EmptyState
                icon={Repeat}
                title="Nenhuma rotina da casa."
                text="Tirar o lixo, remédio do gato, regar as plantas: qualquer um confirma e o outro vê."
                action={
                  <Button variant="quiet" icon={Plus} onClick={() => ui.openSheet('routine')}>
                    Criar rotina
                  </Button>
                }
              />
            ) : null}
            <ul className="flex flex-col gap-3">
              {d.routines.map((m) => {
                const dose = d.routineDoses.find((x) => x.med.id === m.id)
                const last = d.lastDone.get(m.id)
                const days = m.weekdays.length ? m.weekdays.map((w) => WEEK[w]).join(', ') : 'Todo dia'
                return (
                  <li key={m.id} className={cx('module p-4', dose ? doseBorder(dose.view) : 'ledger-solid')} data-testid="routine-card">
                    <div className="flex items-start gap-3">
                      <Repeat size={20} aria-hidden className="mt-0.5 shrink-0 text-couple" />
                      <div className="min-w-0 flex-1">
                        <div className="-mt-2 -mr-2 flex items-start justify-between gap-1">
                          <p className="min-w-0 pt-2 text-[16px] font-bold break-words text-ink">{m.name}</p>
                          <EditButton label={`Editar rotina ${m.name}`} onClick={() => ui.openSheet('routine', { id: m.id })} testId="routine-edit" />
                        </div>
                        {m.assignee ? (
                          <OwnerTag tone={toneOf(m.assignee)}>
                            Responsável: {m.assignee === viewer ? 'você' : profiles[m.assignee]?.displayName}
                          </OwnerTag>
                        ) : null}
                        <p className="text-[13px] break-words text-muted">
                          {days} · <span className="font-data">{m.times.join(', ')}</span> · {m.dosage}
                        </p>
                        <p className="mt-1 text-[13px] text-muted">
                          {last ? (
                            <>
                              Última vez: {last.by === viewer ? 'você' : profiles[last.by as 'A' | 'B']?.displayName}, às <span className="font-data">{formatClock(last.at)}</span>
                            </>
                          ) : (
                            'Ainda sem registro'
                          )}
                        </p>
                      </div>
                    </div>
                    {dose ? (
                      <div className="mt-3 flex flex-col gap-3">
                        <DoseStatus dose={dose} now={now} />
                        <DoseActions dose={dose} />
                      </div>
                    ) : (
                      <p className="mt-3 text-[13px] text-muted">Não é dia desta rotina.</p>
                    )}
                    {m.stockCount !== null ? <StockMeter med={m} /> : null}
                  </li>
                )
              })}
            </ul>
          </section>

          <section aria-labelledby="rede-apoio">
            <SectionHeader id="rede-apoio" title={`Rede de apoio de ${partner.displayName}`} rest="· só o que foi compartilhado" />
            {d.partnerDoses.length === 0 ? (
              <p className="rounded-[18px] border border-dashed border-line-strong p-4 text-[14px] text-muted">
                {partner.displayName} não compartilhou nenhum remédio com a rede de apoio hoje.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {d.partnerDoses.map((dose) => (
                  <li key={dose.log.id} className={cx('card p-4', doseBorder(dose.view))} data-testid="partner-dose">
                    <p className="text-[15px] font-bold text-ink">
                      <span className="font-data">{dose.log.scheduledTime}</span> · {dose.med.name}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <DoseStatus dose={dose} now={now} />
                      {dose.view === 'LATE' ? (
                        d.nudged.has(dose.log.id) ? (
                          <StatusBadge kind="ok">Lembrete enviado</StatusBadge>
                        ) : (
                          <Button size="sm" variant="primary" icon={HandHeart} onClick={() => sendNudge(dose.log.id, dose.med.name)}>
                            Mandar lembrete carinhoso
                          </Button>
                        )
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <CycleSection />
        </div>
      </div>
    </div>
  )
}

function DoseCard({ dose, now }: { dose: DoseItem; now: Date }) {
  const { med, log } = dose
  return (
    <li className={cx('module p-4 sm:p-5', doseBorder(dose.view))} data-testid="dose-card" data-med={med.name}>
      <div className="flex items-start gap-3">
        <span className="font-data pt-0.5 text-[20px] font-semibold text-ink">{log.scheduledTime}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold text-ink">{med.name}</p>
          <p className="text-[13px] text-muted">{med.dosage}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <DoseStatus dose={dose} now={now} />
        <DoseActions dose={dose} />
      </div>
      {/* o estoque completo fica em "Estoque e rede de apoio"; aqui só o alerta de acabando */}
      {med.stockCount !== null && isLowStock(med) ? <StockMeter med={med} compact /> : null}
    </li>
  )
}

const STOCK_FILL = { ok: 'bg-ok', warn: 'bg-warn', low: 'bg-err' } as const

/** Estoque: quantidade, até quando dura e barra de nível. Um bloco de texto só (não quebra palavra a palavra). */
function StockMeter({ med, compact }: { med: Medication; compact?: boolean }) {
  const today = toDateKey(useNow())
  const low = isLowStock(med)
  const days = stockDaysLeft(med)
  const until = stockRunsOutOn(med, today)
  const level = stockLevel(med)
  const unit = med.stockUnit || (med.kind === 'ROUTINE' ? 'unidades' : 'comprimidos')
  return (
    <div className={compact ? 'mt-3' : 'mt-2'} data-testid="stock-line">
      {low ? (
        <StatusBadge kind="late" className="mb-2">
          Estoque baixo · comprar ou pedir receita
        </StatusBadge>
      ) : null}
      <p className="flex items-start gap-2 text-[13px] text-muted">
        <Package size={15} aria-hidden className="mt-0.5 shrink-0" />
        <span className="min-w-0">
          <span className={cx('font-data font-semibold', low ? 'text-err' : 'text-ink')}>{med.stockCount}</span> {unit}
          {days !== null && until ? (
            <>
              {' · '}
              {days === 0 ? (
                'acaba hoje'
              ) : (
                <>
                  dá para uns {days} {days === 1 ? 'dia' : 'dias'} (até{' '}
                  <span className="font-data whitespace-nowrap">
                    {until.slice(8, 10)}/{until.slice(5, 7)}
                  </span>
                  )
                </>
              )}
            </>
          ) : null}
        </span>
      </p>
      {level && !compact ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
          <div className={cx('h-full rounded-full', STOCK_FILL[level.level])} style={{ width: `${Math.max(4, level.ratio * 100)}%` }} />
        </div>
      ) : null}
    </div>
  )
}

function MedSettings({ med, partnerName }: { med: Medication; partnerName: string }) {
  return (
    <li className="card p-4" data-testid="med-settings" data-med={med.name}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-[15px] font-bold break-words text-ink">{med.name}</p>
        {med.stockCount !== null ? (
          <Button size="sm" variant="quiet" icon={Plus} onClick={() => restock(med.id, 30)} aria-label={`Repor 30 unidades de ${med.name}`} className="shrink-0">
            Repor 30
          </Button>
        ) : null}
        <EditButton label={`Editar remédio ${med.name}`} onClick={() => ui.openSheet('newMed', { id: med.id })} testId="med-edit" />
      </div>
      <p className="mt-0.5 text-[13px] text-muted">
        {med.dosage} · <span className="font-data">{med.times.join(', ')}</span>
      </p>
      {med.stockCount !== null ? <StockMeter med={med} /> : <p className="mt-1 text-[13px] text-muted">Sem controle de estoque.</p>}
      <div className="mt-3 border-t border-line pt-3">
        <Switch
          checked={med.notifyPartnerOnDelay}
          onChange={(v) => setPartnerSupport(med.id, v)}
          testId={`support-${med.name}`}
          label="Rede de apoio do par (+30 min)"
          description={`Se eu atrasar mais de ${med.delayMinutesThreshold} min, ${partnerName} recebe um aviso gentil.`}
        />
      </div>
    </li>
  )
}
