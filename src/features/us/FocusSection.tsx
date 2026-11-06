import { HeartHandshake, Play, Square, Timer, UserPlus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Button, cx, FieldError, SectionHeader, Segmented, StatusBadge } from '../../components/ui'
import { toDateKey } from '../../domain/dates'
import { tasksForDay } from '../../domain/tasks'
import { activeFocus, FOCUS_DURATIONS, focusView } from '../../domain/together'
import type { FocusSession } from '../../domain/types'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { cancelFocus, finishFocus, joinFocus, startFocus } from '../../store/togetherActions'

const first = (name: string) => name.split(' ')[0]!

/** Sessão em andamento: a mesma no Hoje e na aba Nós. Relógio de minuto (o de segundos é só do "Pegando água"). */
export function FocusCard({ session, compact }: { session: FocusSession; compact?: boolean }) {
  // o relógio de minuto só dispara o re-render; a conta usa a hora exata (o de minuto é arredondado para baixo)
  useNow()
  const { viewer, profiles } = usePeople()
  const v = focusView(session, new Date())
  const mine = session.startedBy === viewer
  const other = mine ? session.joinedBy : session.startedBy
  const starter = first(profiles[session.startedBy].displayName)
  const together = !!session.joinedBy
  const canJoin = !mine && !session.joinedBy
  return (
    <section className={cx(compact ? 'module' : 'card', 'p-4 sm:p-5', together ? 'ledger-solid' : 'ledger-dashed')} data-testid="focus-card" data-state={v.state} aria-label="Fazendo junto">
      <p className="flex items-center gap-2 text-[13px] font-bold text-couple">
        <HeartHandshake size={16} aria-hidden /> {mine ? 'Você começou' : `${starter} começou`} · fazendo junto
      </p>
      <p className="mt-2 text-[17px] font-bold break-words text-ink">{session.title}</p>
      {v.state === 'running' ? (
        <p className="mt-1 text-[14px] text-muted" data-testid="focus-left">
          Faltam <span className="font-data font-semibold text-ink">{v.minutesLeft} min</span> · até <span className="font-data">{v.endsAtLabel}</span>
        </p>
      ) : (
        <StatusBadge kind="ok" className="mt-2">
          Tempo! Terminaram?
        </StatusBadge>
      )}
      <p className="mt-1 text-[13px] text-muted">
        {together ? `${other === viewer ? 'Você' : first(profiles[other!].displayName)} ${other === viewer ? 'entrou' : 'está junto'}.` : mine ? 'Esperando seu par entrar. Pode começar sozinho(a).' : `${starter} chamou você para fazer junto.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canJoin ? (
          <Button variant="primary" size="compact" icon={UserPlus} onClick={() => joinFocus(session.id)} className="grow basis-[130px]" data-testid="focus-join">
            Entrar junto
          </Button>
        ) : null}
        <Button
          variant={canJoin ? 'secondary' : 'primary'}
          size="compact"
          onClick={() => finishFocus(session.id)}
          className="grow basis-[130px]"
          data-testid="focus-finish"
        >
          Terminamos
        </Button>
        <Button variant="ghost" size="compact" icon={Square} onClick={() => cancelFocus(session.id)} data-testid="focus-cancel">
          Parar
        </Button>
      </div>
    </section>
  )
}

/** Hoje: sessão aberta (de qualquer um dos dois) */
export function FocusTodayCard() {
  const now = useNow()
  const all = useData((s) => s.focusSessions)
  const s = useMemo(() => activeFocus(Object.values(all), now), [all, now])
  return s ? <FocusCard session={s} compact /> : null
}

/** Aba Nós: começar uma sessão (tarefa de hoje em 1 toque, ou escrever) */
export function FocusSection() {
  const now = useNow()
  const today = toDateKey(now)
  const { viewer, partner } = usePeople()
  const all = useData((s) => s.focusSessions)
  const tasks = useData((s) => s.tasks)
  const active = useMemo(() => activeFocus(Object.values(all), now), [all, now])
  const suggestions = useMemo(
    () => tasksForDay(Object.values(tasks), today).filter((t) => t.status === 'PENDING' && (t.assignedTo === viewer || t.assignedTo === null)).slice(0, 3),
    [tasks, today, viewer],
  )
  const [title, setTitle] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [minutes, setMinutes] = useState<string>('25')
  const [error, setError] = useState<string>()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('O que vocês vão fazer? (ex.: lavar a louça)')
      return
    }
    if (startFocus(title, Number(minutes), taskId)) {
      setTitle('')
      setTaskId(null)
    }
  }

  return (
    <section aria-labelledby="junto-title" data-testid="focus-section">
      <SectionHeader id="junto-title" title="Fazer junto" rest="· body doubling" />
      {active ? (
        <FocusCard session={active} />
      ) : (
        <form onSubmit={submit} className="card p-4" noValidate data-testid="focus-form">
          <p className="text-[14px] text-muted">
            Tarefa chata fica mais leve com {first(partner.displayName)} por perto, mesmo cada um na sua. Comece e {first(partner.displayName)} recebe o convite.
          </p>
          {suggestions.length ? (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Tarefas de hoje">
              {suggestions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTitle(t.title)
                    setTaskId(t.id)
                    setError(undefined)
                  }}
                  aria-pressed={taskId === t.id}
                  className={cx(
                    'press min-h-11 rounded-[12px] border px-3 text-left text-[13px] font-semibold',
                    taskId === t.id ? 'border-action bg-selected text-ink' : 'border-line text-ink hoverable',
                  )}
                  data-testid="focus-suggestion"
                >
                  {t.title}
                </button>
              ))}
            </div>
          ) : null}
          <label htmlFor="focus-title" className="mt-3 mb-2 block text-[14px] font-semibold text-ink">
            O que vão fazer
          </label>
          <input
            id="focus-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setTaskId(null)
              setError(undefined)
            }}
            maxLength={80}
            placeholder="Ex.: separar roupas para doação"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'focus-err' : undefined}
            data-testid="focus-title"
            className={cx('min-h-12 w-full min-w-0 rounded-[16px] border bg-bg px-4 text-[16px] text-ink placeholder:text-muted', error ? 'border-err' : 'border-line-strong')}
          />
          {error ? <FieldError id="focus-err">{error}</FieldError> : null}
          <div className="mt-3">
            <Segmented
              label="Duração"
              value={minutes}
              onChange={setMinutes}
              size="sm"
              fill
              options={FOCUS_DURATIONS.map((m) => ({ value: String(m), label: `${m} min`, icon: Timer, testId: `focus-${m}` }))}
            />
          </div>
          <Button type="submit" variant="primary" icon={Play} className="mt-3 w-full" data-testid="focus-start">
            Começar
          </Button>
        </form>
      )}
    </section>
  )
}
