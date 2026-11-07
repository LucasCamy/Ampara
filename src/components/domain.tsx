import { firstName } from '../domain/format'
import { Brain, Check, CircleDashed, Clock, LifeBuoy, Mail, MoveRight, Zap } from 'lucide-react'
import { formatClock, formatDuration } from '../domain/format'
import type { DoseView } from '../domain/medication'
import { minutesLate } from '../domain/medication'
import type { DoseItem } from '../domain/today'
import type { Task } from '../domain/types'
import { postponeTask, sendTaskToPartner, snoozeDose, takeDose, toggleTask } from '../store/actions'
import { useSecondNow } from '../store/clock'
import { ownerLabel, toneOf, usePeople } from '../store/hooks'
import { ui } from '../store/ui'
import { Button, cx, OwnerTag, StatusBadge } from './ui'

export function Countdown({ until }: { until: string }) {
  const now = useSecondNow()
  const ms = new Date(until).getTime() - now
  return (
    <span className="font-data" aria-label={`Faltam ${formatDuration(ms)} minutos`}>
      {formatDuration(ms)}
    </span>
  )
}

export const formatLate = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`)

export function DoseStatus({ dose, now }: { dose: DoseItem; now: Date }) {
  const { log } = dose
  switch (dose.view) {
    case 'TAKEN':
      return <StatusBadge kind="ok">{dose.med.kind === 'ROUTINE' ? 'Feito' : 'Tomado'} às {log.takenAt ? formatClock(log.takenAt) : ''}</StatusBadge>
    case 'SKIPPED':
      return <StatusBadge kind="skipped">Dose pulada</StatusBadge>
    case 'SNOOZED_WATER':
      return (
        <StatusBadge kind="snooze">
          Pegando água · <Countdown until={log.snoozeUntil as string} />
        </StatusBadge>
      )
    case 'LATE':
      return <StatusBadge kind="late">Atrasado há {formatLate(minutesLate(log, now))}</StatusBadge>
    case 'DUE':
      return <StatusBadge kind="pending">Agora · {log.scheduledTime}</StatusBadge>
    case 'UPCOMING':
      return <StatusBadge kind="pending">Previsto {log.scheduledTime}</StatusBadge>
  }
}

export const doseBorder = (v: DoseView) =>
  v === 'TAKEN' ? 'ledger-ok' : v === 'LATE' ? 'ledger-err' : v === 'SKIPPED' ? 'ledger-solid' : 'ledger-dashed'

/** Confirmação em 2 estágios: Já engoli / Pegando água (+5 min) */
export function DoseActions({ dose, size = 'md', onAfter }: { dose: DoseItem; size?: 'md' | 'lg'; onAfter?: () => void }) {
  const { med, log, view } = dose
  if (view === 'TAKEN' || view === 'SKIPPED') return null
  const routine = med.kind === 'ROUTINE'
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="primary"
        size={size}
        icon={Check}
        data-testid="dose-take"
        onClick={() => {
          takeDose(med.id, log.scheduledDate, log.scheduledTime)
          onAfter?.()
        }}
        className="grow basis-[120px]"
      >
        {routine ? 'Feito' : 'Já engoli'}
      </Button>
      {!routine ? (
        <Button
          variant="secondary"
          size={size}
          icon={Clock}
          data-testid="dose-snooze"
          onClick={() => {
            snoozeDose(med.id, log.scheduledDate, log.scheduledTime)
            onAfter?.()
          }}
          className="grow basis-[120px] border-dashed"
          aria-label={view === 'SNOOZED_WATER' ? 'Mais 5 minutos pegando água' : 'Pegando água (+5 min)'}
        >
          {view === 'SNOOZED_WATER' ? 'Mais 5 min' : (
            <>
              <span className="sm:hidden">Água +5 min</span>
              <span className="hidden sm:inline">Pegando água (+5 min)</span>
            </>
          )}
        </Button>
      ) : null}
    </div>
  )
}

export function EffortTag({ effort }: { effort: Task['effort'] }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted">
      {effort === 'QUICK_5M' ? <Zap size={13} aria-hidden /> : <Brain size={13} aria-hidden />}
      {effort === 'QUICK_5M' ? 'Rápida 5 min' : 'Foco'}
    </span>
  )
}

/** Linha de tarefa com conclusão em 1 toque e ações rápidas direto no card (ARQ-D) */
export function TaskRow({
  task,
  actions = ['help'],
}: {
  task: Task
  actions?: ('help' | 'postpone' | 'send')[]
}) {
  const { viewer, partner, profiles } = usePeople()
  const done = task.status === 'DONE'
  const sentToMe = task.sentBy !== null && task.sentBy !== viewer && task.assignedTo === viewer
  const sentByMe = task.sentBy === viewer && task.assignedTo !== viewer
  return (
    <li
      data-testid="task-row"
      data-task-title={task.title}
      className={cx('flex items-start gap-2 rounded-[18px] bg-surface p-2', done ? 'ledger-ok' : 'border border-line')}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
        onClick={() => toggleTask(task.id)}
        className={cx('press inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]', done ? 'text-ok' : 'text-muted hoverable')}
      >
        {done ? (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ok text-surface">
            <Check size={18} strokeWidth={3} aria-hidden />
          </span>
        ) : (
          <CircleDashed size={28} aria-hidden />
        )}
      </button>
      <div className="min-w-0 flex-1 py-1.5">
        <p className={cx('text-[15px] leading-snug font-semibold text-ink', done && 'text-muted line-through decoration-1')}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <OwnerTag tone={toneOf(task.assignedTo)}>{ownerLabel(task.assignedTo, viewer, partner)}</OwnerTag>
          <EffortTag effort={task.effort} />
          {task.dueTime ? <span className="font-data text-[12px] text-muted">{task.dueTime}</span> : null}
          {sentToMe ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-couple">
              <Mail size={13} aria-hidden /> Enviada por {firstName(profiles[task.sentBy!].displayName)}
            </span>
          ) : null}
          {sentByMe ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted">
              <MoveRight size={13} aria-hidden /> Você enviou
            </span>
          ) : null}
          {done && task.completedBy ? (
            <StatusBadge kind="ok" className="min-h-6 text-[12px]">
              Feito por {task.completedBy === viewer ? 'você' : firstName(profiles[task.completedBy].displayName)}
            </StatusBadge>
          ) : null}
        </div>
        {!done && (actions.includes('postpone') || (actions.includes('send') && task.assignedTo === viewer)) ? (
          <div className="mt-2 flex gap-2">
            {actions.includes('postpone') ? (
              <button
                type="button"
                onClick={() => postponeTask(task.id)}
                aria-label={`Adiar para amanhã: ${task.title}`}
                className="press hoverable inline-flex min-h-11 min-w-0 grow basis-0 items-center justify-center gap-1.5 rounded-[12px] border border-line px-2 text-[13px] font-semibold text-action"
              >
                <MoveRight size={15} aria-hidden /> <span className="sm:hidden">Amanhã</span><span className="hidden sm:inline">Adiar para amanhã</span>
              </button>
            ) : null}
            {actions.includes('send') && task.assignedTo === viewer ? (
              <button
                type="button"
                onClick={() => sendTaskToPartner(task.id)}
                aria-label={`Enviar para ${firstName(partner.displayName)}: ${task.title}`}
                className="press hoverable inline-flex min-h-11 min-w-0 grow basis-0 items-center justify-center gap-1.5 rounded-[12px] border border-line px-2 text-[13px] font-semibold text-action"
              >
                <Mail size={15} aria-hidden /> <span className="sm:hidden">Enviar ao amor</span><span className="hidden sm:inline">Enviar para meu amor</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {!done ? (
        <div className="flex shrink-0 items-center">
          {actions.includes('help') ? (
            <button
              type="button"
              onClick={() => ui.openSheet('sos', { taskId: task.id })}
              aria-label={`Pedir ajuda com: ${task.title}`}
              className="press hoverable inline-flex h-12 w-12 items-center justify-center rounded-[12px] text-muted"
            >
              <LifeBuoy size={20} aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
