import { firstName } from '../../domain/format'
import { AlarmClock, ArrowLeft, Brain, CalendarDays, HandHeart, HeartHandshake, Sun, Zap, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cx } from '../../components/ui'
import { toDateKey } from '../../domain/dates'
import { filterTasks, tasksForDay } from '../../domain/tasks'
import type { HelpType, Urgency } from '../../domain/types'
import { requestHelp } from '../../store/actions'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { usePeople } from '../../store/hooks'

const GENERAL = '__general__'

function BigOption({ icon: Icon, title, hint, onClick, testId }: { icon: LucideIcon; title: string; hint?: string; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="press hoverable flex min-h-14 w-full items-center gap-3 rounded-[18px] border border-line px-4 py-3 text-left"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-subtle text-ink">
        <Icon size={20} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        {hint ? <span className="block text-[13px] text-muted">{hint}</span> : null}
      </span>
    </button>
  )
}

/** Triagem ARQ-E: 1. o quê → 2. como ajudar → 3. urgência (envia no 3º toque) */
export function SosSheet({ params, onDone }: { params: Record<string, string>; onDone: () => void }) {
  const now = useNow()
  const { viewer, me, partner } = usePeople()
  const tasks = useData((s) => s.tasks)
  const today = toDateKey(now)
  const candidates = useMemo(
    () => filterTasks(tasksForDay(Object.values(tasks), today), viewer, 'ALL').filter((t) => t.status === 'PENDING' && (t.assignedTo === viewer || t.assignedTo === null)),
    [tasks, today, viewer],
  )
  const pre = params.taskId && tasks[params.taskId] ? params.taskId : null
  const [target, setTarget] = useState<string | null>(pre)
  const [helpType, setHelpType] = useState<HelpType | null>(null)
  const step = target === null ? 1 : helpType === null ? 2 : 3
  const stuck = me.pronoun === 'ela' ? 'travada / sobrecarregada' : 'travado / sobrecarregado'

  const situation = target === GENERAL ? `Estou ${stuck} no geral` : (tasks[target ?? '']?.title ?? '')

  return (
    <div className="pt-1 pb-3">
      <div className="mb-4 flex items-center gap-2">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => (step === 3 ? setHelpType(null) : setTarget(null))}
            aria-label="Voltar um passo"
            className="press hoverable inline-flex h-11 w-11 items-center justify-center rounded-full text-ink"
          >
            <ArrowLeft size={20} aria-hidden />
          </button>
        ) : null}
        <ol className="flex flex-1 gap-1.5" aria-label={`Passo ${step} de 3`}>
          {[1, 2, 3].map((n) => (
            <li key={n} aria-current={n === step ? 'step' : undefined} className={cx('h-1.5 flex-1 rounded-full', n <= step ? 'bg-action' : 'bg-subtle')} />
          ))}
        </ol>
        <span className="font-data text-[13px] text-muted">{step}/3</span>
      </div>

      {step === 1 ? (
        <section aria-labelledby="sos-1">
          <h3 id="sos-1" className="mb-3 text-[17px] font-bold text-ink">
            Com o que você precisa de ajuda?
          </h3>
          <div className="flex flex-col gap-2">
            {candidates.map((t) => (
              <BigOption key={t.id} icon={t.effort === 'FOCUS' ? Brain : Zap} title={t.title} onClick={() => setTarget(t.id)} testId="sos-task" />
            ))}
            <BigOption icon={Brain} title={`Estou ${stuck} no geral`} hint="Cabeça travada, rotina pesada" onClick={() => setTarget(GENERAL)} testId="sos-general" />
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section aria-labelledby="sos-2">
          <p className="mb-1 text-[13px] font-semibold text-muted">{situation}</p>
          <h3 id="sos-2" className="mb-3 text-[17px] font-bold text-ink">
            Como {firstName(partner.displayName)} pode ajudar?
          </h3>
          <div className="flex flex-col gap-2">
            <BigOption icon={HandHeart} title="Assumir por mim" hint="Não vou dar conta, você consegue fazer?" onClick={() => setHelpType('TAKE_OVER')} testId="sos-take-over" />
            <BigOption icon={HeartHandshake} title="Fazer junto comigo" hint="Body doubling: só preciso de companhia para começar" onClick={() => setHelpType('BODY_DOUBLING')} testId="sos-body-doubling" />
            <BigOption icon={AlarmClock} title="Me lembrar mais tarde" hint="Me chama de novo com carinho" onClick={() => setHelpType('REMIND_ME')} testId="sos-remind" />
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section aria-labelledby="sos-3">
          <p className="mb-1 text-[13px] font-semibold text-muted">{situation}</p>
          <h3 id="sos-3" className="mb-3 text-[17px] font-bold text-ink">
            Para quando?
          </h3>
          <div className="flex flex-col gap-2">
            {(
              [
                ['NOW', 'Agora', Zap],
                ['TODAY', 'Ainda hoje', Sun],
                ['THIS_WEEK', 'Até o fim da semana', CalendarDays],
              ] as [Urgency, string, LucideIcon][]
            ).map(([u, label, icon]) => (
              <BigOption
                key={u}
                icon={icon}
                title={label}
                testId={`sos-urgency-${u}`}
                onClick={() => {
                  requestHelp({ targetTaskId: target === GENERAL ? null : target, situation, helpType: helpType as HelpType, urgency: u })
                  onDone()
                }}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
