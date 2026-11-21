import { firstName } from '../../domain/format'
import { Coffee, HeartHandshake, Play, Square, Timer, UserPlus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Button, cx, FieldError, SectionHeader, Segmented, StatusBadge } from '../../components/ui'
import { toDateKey } from '../../domain/dates'
import { canViewTask, tasksForDay } from '../../domain/tasks'
import { activeFocus, canViewFocusSession, FOCUS_DURATIONS, focusView } from '../../domain/together'
import type { FocusSession } from '../../domain/types'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { useIsSolo, usePeople } from '../../store/hooks'
import { cancelFocus, extendFocus, finishFocus, joinFocus, pauseFocus, startFocus, toggleTaskStep } from '../../store/togetherActions'


/** Sessão em andamento: a mesma no Hoje e na aba Nós. Relógio de minuto (o de segundos é só do "Pegando água"). */
export function FocusCard({ session, compact }: { session: FocusSession; compact?: boolean }) {
  const isSolo = useIsSolo()
  // o relógio de minuto só dispara o re-render; a conta usa a hora exata (o de minuto é arredondado para baixo)
  useNow()
  const { viewer, profiles } = usePeople()
  const task = useData((state) => {
    const linked = session.taskId ? state.tasks[session.taskId] : undefined
    return linked && canViewTask(linked, viewer) ? linked : undefined
  })
  const visible = useData((state) => canViewFocusSession(session, viewer, state.tasks))
  if (!visible) return null
  const v = focusView(session, new Date())
  const mine = session.startedBy === viewer
  const other = mine ? session.joinedBy : session.startedBy
  const starter = firstName(profiles[session.startedBy].displayName)
  const individual = isSolo || session.joinedBy === session.startedBy
  const together = !individual && !!session.joinedBy
  const canJoin = !individual && !mine && !session.joinedBy
  const canManage = !individual || mine
  return (
    <section className={cx(compact ? 'module' : 'card', 'p-4 sm:p-5', together || individual ? 'ledger-solid' : 'ledger-dashed')} data-testid="focus-card" data-state={v.state} aria-label={individual ? 'Seu foco' : 'Fazendo junto'}>
      <p className="flex items-center gap-2 text-[13px] font-bold text-couple">
        {individual ? <Timer size={16} aria-hidden /> : <HeartHandshake size={16} aria-hidden />}
        {individual ? (mine ? 'Seu tempo de foco' : `Foco individual de ${starter}`) : `${mine ? 'Você começou' : `${starter} começou`} · fazendo junto`}
      </p>
      <p className="mt-2 text-[17px] font-bold break-words text-ink">{session.title}</p>
      {v.state === 'running' ? (
        <p className="mt-1 text-[14px] text-muted" data-testid="focus-left">
          Faltam <span className="font-data font-semibold text-ink">{v.minutesLeft} min</span> · até <span className="font-data">{v.endsAtLabel}</span>
        </p>
      ) : (
        <StatusBadge kind="ok" className="mt-2">
          {individual ? 'Tempo encerrado' : 'Tempo! Terminaram?'}
        </StatusBadge>
      )}
      <p className="mt-1 text-[13px] text-muted">
        {individual ? 'Cuide só deste começo. Uma coisa por vez.' : together ? `${other === viewer ? 'Você' : firstName(profiles[other!].displayName)} ${other === viewer ? 'entrou' : 'está junto'}.` : mine ? 'Esperando seu par entrar. Pode começar sozinho(a).' : `${starter} chamou você para fazer junto.`}
      </p>
      {individual && task?.steps?.length ? (
        <div className="mt-4" data-testid="focus-steps">
          <p className="text-[13px] font-semibold text-ink">Micro-passos de {task.title}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {task.steps.map((step) => (
              <li key={step.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={step.done}
                  aria-label={`${step.done ? 'Reabrir' : 'Concluir'} micro-passo: ${step.text}`}
                  disabled={!canManage}
                  onClick={() => toggleTaskStep(task.id, step.id)}
                  data-testid="focus-step"
                  data-step-id={step.id}
                  className={cx('press flex min-h-12 w-full items-center justify-between gap-3 rounded-[14px] border p-3 text-left text-[14px] font-semibold', step.done ? 'ledger-ok text-muted' : 'ledger-dashed text-ink')}
                >
                  <span className="min-w-0 break-words">{step.text}</span>
                  <StatusBadge kind={step.done ? 'ok' : 'pending'} className="shrink-0">{step.done ? 'Feito' : 'Pendente'}</StatusBadge>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-muted">Terminar o foco só conclui a tarefa quando seus passos estiverem feitos. Um micro-passo ligado é marcado ao terminar.</p>
        </div>
      ) : null}
      {canManage ? <div className="mt-3 flex flex-wrap gap-2">
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
          {individual ? 'Terminei' : 'Terminamos'}
        </Button>
        {individual && v.state === 'finished' ? (
          <>
            <Button variant="secondary" size="compact" className="grow basis-[100px]" disabled={session.durationMin > 110} onClick={() => extendFocus(session.id)} data-testid="focus-extend"><span className="font-data">+10 min</span></Button>
            <Button variant="quiet" size="compact" icon={Coffee} className="grow basis-[130px]" onClick={() => pauseFocus(session.id)} data-testid="focus-pause">Fazer pausa</Button>
          </>
        ) : <Button variant="secondary" size="compact" icon={Square} className="grow basis-[100px]" onClick={() => cancelFocus(session.id)} data-testid="focus-cancel">Parar</Button>}
      </div> : null}
    </section>
  )
}

/** Hoje: sessão aberta (de qualquer um dos dois) */
export function FocusTodayCard() {
  const { viewer } = usePeople()
  const isSolo = useIsSolo()
  const now = useNow()
  const all = useData((s) => s.focusSessions)
  const tasks = useData((s) => s.tasks)
  const s = useMemo(() => activeFocus(Object.values(all).filter((session) => canViewFocusSession(session, viewer, tasks) && (session.startedBy === viewer || (!isSolo && session.joinedBy !== session.startedBy))), now), [all, tasks, now, viewer, isSolo])
  return s ? <FocusCard session={s} compact /> : null
}

/** Aba Nós: começar uma sessão (tarefa de hoje em 1 toque, ou escrever) */
export function FocusSection() {
  const isSolo = useIsSolo()
  const now = useNow()
  const today = toDateKey(now)
  const { viewer, partner } = usePeople()
  const all = useData((s) => s.focusSessions)
  const tasks = useData((s) => s.tasks)
  const active = useMemo(() => activeFocus(Object.values(all).filter((session) => canViewFocusSession(session, viewer, tasks) && (session.startedBy === viewer || (!isSolo && session.joinedBy !== session.startedBy))), now), [all, tasks, now, viewer, isSolo])
  const suggestions = useMemo(
    () => tasksForDay(Object.values(tasks), today).filter((t) => t.status === 'PENDING' && (t.assignedTo === viewer || t.assignedTo === null) && canViewTask(t, viewer)).slice(0, 3),
    [tasks, today, viewer],
  )
  const [title, setTitle] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [minutes, setMinutes] = useState<string>(isSolo ? '5' : '25')
  const [error, setError] = useState<string>()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError(isSolo ? 'O que você quer começar? (ex.: lavar a louça)' : 'O que vocês vão fazer? (ex.: lavar a louça)')
      return
    }
    if (startFocus(title, Number(minutes), taskId)) {
      setTitle('')
      setTaskId(null)
    }
  }

  return (
    <section aria-labelledby="junto-title" data-testid="focus-section">
      <SectionHeader id="junto-title" title={isSolo ? 'Meu foco' : 'Fazer junto'} rest={isSolo ? '· um começo possível' : '· body doubling'} />
      {active ? (
        <FocusCard session={active} />
      ) : (
        <form onSubmit={submit} className="card p-4" noValidate data-testid="focus-form">
          <p className="text-[14px] text-muted">
            {isSolo ? 'Escolha uma tarefa e separe um pouco de tempo para começar. Você pode parar quando precisar.' : `Tarefa chata fica mais leve com ${firstName(partner.displayName)} por perto, mesmo cada um na sua. Comece e ${firstName(partner.displayName)} recebe o convite.`}
          </p>
          {suggestions.length ? (
            <div className="mt-3 flex flex-col gap-2" aria-label="Tarefas de hoje">
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
                    'press min-h-11 w-full rounded-[12px] border px-3 py-2 text-left text-[14px] font-semibold',
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
            {isSolo ? 'O que você quer começar' : 'O que vão fazer'}
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
              options={FOCUS_DURATIONS.map((m) => ({ value: String(m), label: <span className="font-data">{m} min</span>, testId: `focus-${m}` }))}
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
