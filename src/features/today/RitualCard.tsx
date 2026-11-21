import { BatteryFull, BatteryLow, BatteryMedium, Check, Coffee, Moon, Sunrise, X } from 'lucide-react'
import { useLayoutEffect } from 'react'
import { Button, Segmented } from '../../components/ui'
import { toDateKey } from '../../domain/dates'
import { buildDaySpeechSummary } from '../../domain/today'
import { ritualAlertKey, ritualDayProgress, ritualLocalScope, RITUAL_LABELS } from '../../domain/rituals'
import type { EnergyLevel } from '../../domain/types'
import { setEnergy } from '../../store/actions'
import { dismissWhere, markSeen, useAlertPrefs } from '../../store/alerts'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { completeRitual, useRitualWindow } from '../../store/rituals'
import { reliefToday, movePendingToTomorrow } from '../../store/unstuckActions'
import { ui } from '../../store/ui'
import { DayListenButton } from './DayListenButton'

const ICONS = { morning: Sunrise, afternoon: Coffee, evening: Moon }

export function RitualCard() {
  const state = useData((value) => value)
  const { viewer, me } = usePeople()
  const now = useNow()
  const date = toDateKey(now)
  const schedules = useAlertPrefs((prefs) => prefs.rituals)
  const scope = ritualLocalScope(state)
  const window = useRitualWindow(scope, viewer, now, schedules)
  const spaceId = state.couple.couple?.spaceId
  useLayoutEffect(() => {
    if (!window) return
    const key = ritualAlertKey(spaceId, viewer, date, window)
    markSeen([key])
    dismissWhere((alert) => alert.key === key)
  }, [spaceId, viewer, date, window])
  if (!window) return null
  const Icon = ICONS[window]
  const progress = ritualDayProgress(state, viewer, date)
  const finish = () => {
    const key = ritualAlertKey(state.couple.couple?.spaceId, viewer, date, window)
    markSeen([key])
    dismissWhere((alert) => alert.key === key)
    void completeRitual(scope, viewer, date, window).catch(() => ui.toast('Ritual concluído nesta sessão. Não foi possível guardar o marcador no aparelho.', { tone: 'info' }))
  }

  return (
    <section className="module ledger-dashed p-4 sm:p-5" aria-labelledby="ritual-title" data-testid={`ritual-${window}`}>
      <div className="-mt-1 -mr-1 flex items-center justify-between gap-2">
        <h2 id="ritual-title" className="flex min-w-0 items-center gap-2 text-[17px] font-bold text-ink">
          <Icon size={20} aria-hidden className="shrink-0 text-action" /> {RITUAL_LABELS[window]}
        </h2>
        <Button size="sm" variant="ghost" icon={X} onClick={finish} aria-label={`Dispensar ${RITUAL_LABELS[window]} hoje`} data-testid="ritual-dismiss">Hoje não</Button>
      </div>

      {window === 'morning' ? (
        <>
          <p className="mt-3 text-[14px] text-muted">{buildDaySpeechSummary(state, viewer, now)}</p>
          <div className="mt-3"><DayListenButton state={state} viewer={viewer} now={now} testId="ritual-listen-day" /></div>
          <div className="mt-4">
            <Segmented<EnergyLevel>
              label="Como está sua bateria neste começo de dia?"
              hideLabel={false}
              stretch
              fill
              size="sm"
              value={me.energy}
              onChange={(energy) => { setEnergy(energy); finish() }}
              options={[
                { value: 'FULL', label: 'Cheia', icon: BatteryFull, testId: 'ritual-energy-full' },
                { value: 'MEDIUM', label: 'Média', icon: BatteryMedium, testId: 'ritual-energy-medium' },
                { value: 'OVERLOAD', label: 'Sobrecarga', shortLabel: 'Baixa', icon: BatteryLow, testId: 'ritual-energy-overload' },
              ]}
            />
          </div>
        </>
      ) : window === 'afternoon' ? (
        <>
          <p className="mt-3 text-[15px] text-muted">Como está o seu ritmo? Dá para seguir, aliviar o resto ou começar por um passo bem pequeno.</p>
          <div className="mt-4 flex flex-col gap-2">
            <Button block variant="primary" icon={Check} onClick={() => { finish(); ui.toast('Seguindo no seu ritmo. Uma coisa de cada vez.', { tone: 'info' }) }} data-testid="ritual-keep-going">Seguindo bem</Button>
            <Button block onClick={() => { reliefToday(); finish() }} data-testid="ritual-relief">Aliviar o resto</Button>
            <Button block variant="quiet" onClick={() => { finish(); ui.openSheet('unstuck') }} data-testid="ritual-unstuck">Abrir Travei</Button>
          </div>
        </>
      ) : (
        <>
          {progress.tasksDone || progress.dosesTaken ? (
            <p className="mt-3 text-[15px] text-ink" data-testid="ritual-celebration">Você concluiu <span className="font-data font-semibold">{progress.tasksDone}</span> {progress.tasksDone === 1 ? 'tarefa' : 'tarefas'} e confirmou <span className="font-data font-semibold">{progress.dosesTaken}</span> {progress.dosesTaken === 1 ? 'dose' : 'doses'} hoje. Cada cuidado conta.</p>
          ) : <p className="mt-3 text-[15px] text-muted">Chegar até aqui já conta. Você pode deixar o resto para amanhã e encerrar com calma.</p>}
          {progress.pendingTasks ? (
            <>
              <p className="mt-2 text-[14px] text-muted"><span className="font-data">{progress.pendingTasks}</span> {progress.pendingTasks === 1 ? 'tarefa pode' : 'tarefas podem'} ir para amanhã. Você pode desfazer.</p>
              <Button block variant="primary" className="mt-4" onClick={() => { movePendingToTomorrow(); finish() }} data-testid="ritual-move-tomorrow">Mover pendentes para amanhã</Button>
            </>
          ) : null}
          <Button block variant={progress.pendingTasks ? 'quiet' : 'primary'} className="mt-2" onClick={finish} data-testid="ritual-finish">Encerrar por hoje</Button>
        </>
      )}
    </section>
  )
}
