import { ArrowLeft, BatteryLow, Brain, Feather, ListTodo, Timer, Zap, type LucideIcon } from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { cx, FieldError, TextField } from '../../components/ui'
import { toDateKey } from '../../domain/dates'
import { canViewTask, tasksForDay } from '../../domain/tasks'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { reliefToday, startUnstuckFocus } from '../../store/unstuckActions'
import { ui } from '../../store/ui'
import { ComfortList } from '../us/MoodSection'

type Reason = 'task' | 'racing' | 'low'
type Choice = 'micro' | 'relief' | 'start'

function Option({ icon: Icon, children, hint, onClick, testId, selected }: { icon: LucideIcon; children: ReactNode; hint?: string; onClick: () => void; testId: string; selected?: boolean }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} aria-pressed={selected} className={cx('press flex min-h-14 w-full items-center gap-3 rounded-[18px] border p-4 text-left', selected ? 'border-action bg-selected' : 'hoverable border-line bg-surface')}>
      <Icon size={22} aria-hidden className="shrink-0 text-action" />
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-ink">{children}</span>
        {hint ? <span className="mt-0.5 block text-[13px] text-muted">{hint}</span> : null}
      </span>
    </button>
  )
}

export function UnstuckSheet({ params, onDone }: { params: Record<string, string>; onDone: () => void }) {
  const { viewer } = usePeople()
  const today = toDateKey(useNow())
  const tasks = useData((state) => state.tasks)
  const comfortItems = useData((state) => state.comfortItems)
  const candidates = useMemo(() => tasksForDay(Object.values(tasks), today).filter((task) => task.status === 'PENDING' && (task.assignedTo === viewer || task.assignedTo === null) && canViewTask(task, viewer)), [tasks, today, viewer])
  const pre = params.taskId ? tasks[params.taskId] : undefined
  const validPre = pre && pre.status === 'PENDING' && (pre.assignedTo === viewer || pre.assignedTo === null) && canViewTask(pre, viewer) ? pre.id : null
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [reason, setReason] = useState<Reason | null>(null)
  const [taskId, setTaskId] = useState<string | null>(validPre)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [microStep, setMicroStep] = useState('')
  const [error, setError] = useState<string>()
  const target = taskId ? tasks[taskId] : undefined
  const hasComfort = Object.values(comfortItems).some((item) => item.ownerId === viewer)
  const focusTitle = target?.title ?? (reason === 'racing' ? 'Um começo com a cabeça mais calma' : 'Retomar meu ritmo aos poucos')

  const go = (next: 1 | 2 | 3) => {
    setStep(next)
    setError(undefined)
    ui.setUnstuckStep(next)
  }
  const chooseReason = (next: Reason) => {
    setReason(next)
    if (next !== 'task') {
      setTaskId(null)
      go(2)
    } else if (validPre) {
      setTaskId(validPre)
      go(2)
    } else {
      setError(undefined)
    }
  }
  const choose = (next: Choice) => {
    setChoice(next)
    if (next === 'micro' && !microStep) setMicroStep(target?.steps?.find((item) => !item.done)?.text.slice(0, 80) ?? '')
    if (next === 'relief') reliefToday(taskId)
    go(3)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (step === 1) {
      if (!reason) return setError('Escolha o que está pesando agora.')
      if (reason === 'task' && candidates.length > 0 && !taskId) return setError('Escolha uma tarefa para este começo.')
      go(2)
      return
    }
    if (step === 2) {
      if (!choice) return setError('Escolha um jeito de deixar agora mais leve.')
      go(3)
      return
    }
    if (choice === 'micro' && !microStep.trim()) return setError('Escreva um começo bem pequeno. Só o primeiro movimento.')
    const started = startUnstuckFocus({ taskId, title: focusTitle, ...(choice === 'micro' ? { microStep } : {}) })
    if (!started) return setError('Esta tarefa mudou. Volte um passo e escolha um novo começo.')
    onDone()
    ui.setTab('hoje')
  }

  return (
    <form id="sheet-form-unstuck" onSubmit={submit} noValidate className="flex flex-col gap-4 pt-1 pb-3" data-testid="unstuck-flow" data-step={step}>
      <div className="flex items-center gap-3">
        {step > 1 ? <button type="button" onClick={() => go(step === 3 ? 2 : 1)} aria-label="Voltar um passo" className="press hoverable inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink"><ArrowLeft size={20} aria-hidden /></button> : null}
        <ol className="flex flex-1 gap-1.5" aria-label={`Passo ${step} de 3`}>
          {[1, 2, 3].map((value) => <li key={value} aria-current={value === step ? 'step' : undefined} className={cx('h-1.5 flex-1 rounded-full', value <= step ? 'bg-action' : 'bg-subtle')} />)}
        </ol>
        <span className="font-data shrink-0 text-[13px] text-muted">{step}/3</span>
      </div>

      {step === 1 ? (
        <section aria-labelledby="unstuck-reason">
          <h3 id="unstuck-reason" className="text-[18px] font-bold text-ink">O que travou agora?</h3>
          <p className="mt-1 mb-4 text-[14px] text-muted">Não precisa resolver tudo. Vamos achar um começo possível.</p>
          <div className="flex flex-col gap-2">
            <Option icon={ListTodo} onClick={() => chooseReason('task')} testId="unstuck-reason-task" selected={reason === 'task'}>Uma tarefa de hoje</Option>
            {reason === 'task' ? (
              <div className="flex flex-col gap-2 rounded-[18px] bg-subtle p-3" aria-label="Tarefas para destravar">
                {candidates.length ? candidates.map((task) => (
                  <Option key={task.id} icon={task.effort === 'FOCUS' ? Brain : Zap} testId="unstuck-task" selected={taskId === task.id} onClick={() => { setTaskId(task.id); go(2) }}>{task.title}</Option>
                )) : <p className="text-[14px] text-muted">Não há tarefa de hoje para escolher. Você pode continuar e definir um começo novo.</p>}
              </div>
            ) : null}
            <Option icon={Brain} onClick={() => chooseReason('racing')} testId="unstuck-reason-racing">Cabeça acelerada</Option>
            <Option icon={BatteryLow} onClick={() => chooseReason('low')} testId="unstuck-reason-low">Sem energia</Option>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section aria-labelledby="unstuck-choice">
          <h3 id="unstuck-choice" className="text-[18px] font-bold text-ink">O que deixaria agora mais leve?</h3>
          <ComfortList owner={viewer} title="O que me acalma" />
          {!hasComfort ? <p className="mt-3 rounded-[16px] bg-subtle p-3 text-[14px] text-muted">Seu kit ainda está vazio. Se ajudar, faça uma pausa pequena antes de escolher.</p> : null}
          {target ? <p className="mt-3 text-[14px] font-semibold text-ink">Para começar: {target.title}</p> : null}
          <div className="mt-4 flex flex-col gap-2">
            <Option icon={Zap} onClick={() => choose('micro')} testId="unstuck-choice-micro" hint="Uma ação pequena, sem dar conta de tudo.">Definir um micro-passo de <span className="font-data">2 min</span></Option>
            <Option icon={Feather} onClick={() => choose('relief')} testId="unstuck-choice-relief" hint="Modo calmo e tarefas sem horário para amanhã. Dá para desfazer.">Aliviar o resto de hoje</Option>
            <Option icon={Timer} onClick={() => choose('start')} testId="unstuck-choice-start" hint="Você pode parar quando precisar.">Só começar por <span className="font-data">5 min</span></Option>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section aria-labelledby="unstuck-start-title">
          <h3 id="unstuck-start-title" className="text-[18px] font-bold text-ink">Só este começo, por enquanto.</h3>
          {choice === 'micro' ? (
            <div className="mt-4">
              <TextField label={<>Um micro-passo de <span className="font-data">2 min</span></>} value={microStep} onChange={(text) => { setMicroStep(text); setError(undefined) }} maxLength={80} error={error} placeholder="Ex.: abrir a pasta e pegar uma folha" testId="unstuck-micro-input" />
              <p className="mt-2 text-[13px] text-muted">Esse pequeno começo não apaga os passos que você já tem.</p>
            </div>
          ) : <p className="mt-3 rounded-[16px] bg-subtle p-4 text-[16px] font-semibold break-words text-ink">{focusTitle}</p>}
          <p className="mt-4 text-[14px] text-muted">O foco começa por <span className="font-data">5 min</span>. Quando o tempo acabar, você escolhe terminar, continuar um pouco ou fazer uma pausa.</p>
          {choice !== 'micro' && error ? <FieldError>{error}</FieldError> : null}
        </section>
      ) : error ? <FieldError>{error}</FieldError> : null}
    </form>
  )
}
