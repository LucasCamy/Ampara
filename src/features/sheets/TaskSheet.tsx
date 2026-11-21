import { firstName } from '../../domain/format'
import { Brain, CalendarDays, ChevronDown, Inbox, Lock, Mail, Plus, Sun, Trash2, User, Users, Zap } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Button, ChoiceChips, cx, FieldError, StatusBadge, TextField } from '../../components/ui'
import { addDays, toDateKey } from '../../domain/dates'
import { isDateKey } from '../../domain/catalog'
import { uuid } from '../../domain/seed'
import type { Task, TaskEffort } from '../../domain/types'
import { saveTask, type TaskDest, type TaskWhen } from '../../store/actions'
import { useNow } from '../../store/clock'
import { dataStore } from '../../store/data'
import { useIsSolo, usePeople } from '../../store/hooks'
import { SHEET_FORM } from './forms'

export function TaskSheet({ params, onDone }: { params: Record<string, string>; onDone: () => void }) {
  const { viewer, partner } = usePeople()
  const isSolo = useIsSolo()
  const today = toDateKey(useNow())
  const taskId = params.id
  const [prev] = useState(() => taskId ? dataStore.get().tasks[taskId] : undefined)
  const [keptDate] = useState(() => prev ? prev.dueDate : params.date && isDateKey(params.date) ? params.date : params.when === 'INBOX' ? null : params.when === 'TOMORROW' ? addDays(today, 1) : today)
  const [title, setTitle] = useState(prev?.title ?? params.title ?? '')
  const [dest, setDest] = useState<TaskDest>(prev ? prev.assignedTo === null ? 'US' : prev.assignedTo === viewer ? 'ME' : 'PARTNER' : params.scope === 'US' ? 'US' : 'ME')
  const [when, setWhen] = useState<TaskWhen | 'KEEP'>(keptDate === null ? 'INBOX' : keptDate === today ? 'TODAY' : keptDate === addDays(today, 1) ? 'TOMORROW' : 'KEEP')
  const [effort, setEffort] = useState<TaskEffort>(prev?.effort ?? (params.effort === 'FOCUS' ? 'FOCUS' : 'QUICK_5M'))
  const [priv, setPriv] = useState(prev ? !prev.visibleToPartner : false)
  const [steps, setSteps] = useState<NonNullable<Task['steps']>>(() => prev?.steps?.length ? prev.steps.map((step) => ({ ...step })) : params.stepsOpen === '1' ? [{ id: uuid(), text: '', done: false }] : [])
  const [showSteps, setShowSteps] = useState(steps.length > 0 || params.stepsOpen === '1')
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Escreva o que precisa ser feito (uma frase curta basta).')
      return
    }
    const saved = saveTask({
      title,
      dest: isSolo ? 'ME' : dest,
      when: when === 'KEEP' ? 'TODAY' : when,
      ...(when === 'KEEP' ? { dueDate: keptDate } : {}),
      effort,
      private: priv,
      steps,
    }, taskId)
    if (saved) onDone()
    else setError('Esta tarefa não está mais disponível. Feche a gaveta e tente de novo.')
  }

  return (
    <form id={SHEET_FORM.task} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <div>
        <label htmlFor={`${id}-t`} className="mb-2 block text-[14px] font-semibold text-ink">
          O que precisa ser feito?
        </label>
        <input
          id={`${id}-t`}
          data-testid="task-title"
          data-autofocus
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            if (error) setError(null)
          }}
          maxLength={120}
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className={cx(
            'min-h-14 w-full rounded-[16px] border bg-bg px-4 text-[16px] text-ink placeholder:text-muted',
            error ? 'border-err' : 'border-line-strong',
          )}
          placeholder="Ex.: comprar ração do gato"
        />
        {error ? <FieldError id={`${id}-err`}>{error}</FieldError> : null}
      </div>

      {!isSolo ? <ChoiceChips<TaskDest>
        label="Para quem"
        value={dest}
        onChange={setDest}
        options={[
          { value: 'ME', label: 'Meu', icon: User },
          { value: 'US', label: 'Nós', icon: Users },
          { value: 'PARTNER', label: `Enviar p/ ${firstName(partner.displayName)}`, icon: Mail },
        ]}
      /> : null}

      <ChoiceChips<TaskWhen | 'KEEP'>
        label="Quando"
        value={when}
        onChange={setWhen}
        options={[
          ...(keptDate && keptDate !== today && keptDate !== addDays(today, 1) ? [{ value: 'KEEP' as const, label: <span>Manter <span className="font-data">{keptDate.slice(8, 10)}/{keptDate.slice(5, 7)}</span></span>, icon: CalendarDays }] : []),
          { value: 'TODAY', label: 'Hoje', icon: Sun },
          { value: 'TOMORROW', label: 'Amanhã', icon: CalendarDays },
          { value: 'INBOX', label: 'Caixa de Entrada', icon: Inbox },
        ]}
      />

      <ChoiceChips<TaskEffort>
        label="Esforço"
        value={effort}
        onChange={setEffort}
        options={[
          { value: 'QUICK_5M', label: 'Rápida 5 min', icon: Zap },
          { value: 'FOCUS', label: 'Foco', icon: Brain },
        ]}
      />

      {!isSolo && dest === 'ME' ? (
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border border-line px-3.5 text-[14px] font-semibold text-ink">
          <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} className="h-5 w-5 accent-[var(--action)]" />
          <Lock size={16} aria-hidden className="text-muted" />
          Só eu vejo (não aparece no painel de {firstName(partner.displayName)})
        </label>
      ) : null}

      <div className="rounded-[18px] border border-line p-3">
        <button
          type="button"
          aria-expanded={showSteps}
          aria-controls={`${id}-steps`}
          data-testid="task-steps-toggle"
          className="press flex min-h-11 w-full items-center justify-between gap-3 text-left text-[14px] font-semibold text-ink"
          onClick={() => {
            if (!showSteps && steps.length === 0) setSteps([{ id: uuid(), text: '', done: false }])
            setShowSteps((open) => !open)
          }}
        >
          Micro-passos <span className="font-normal text-muted">(opcional)</span>
          <ChevronDown size={18} aria-hidden className={cx('shrink-0', showSteps && 'rotate-180')} />
        </button>
        {showSteps ? (
          <div id={`${id}-steps`} className="mt-3 flex flex-col gap-4">
            <p className="text-[13px] text-muted">Um começo pequeno já ajuda. Deixe só os primeiros passos.</p>
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <TextField
                    label={<>Micro-passo <span className="font-data">{index + 1}</span></>}
                    value={step.text}
                    onChange={(text) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, text } : item))}
                    maxLength={120}
                    testId={`task-step-${index + 1}`}
                  />
                  {step.done ? <StatusBadge kind="ok" className="mt-2">Feito</StatusBadge> : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  aria-label={`Remover micro-passo ${index + 1}`}
                  onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))}
                  className="shrink-0 px-3"
                />
              </div>
            ))}
            {steps.length < 3 ? (
              <Button variant="quiet" icon={Plus} onClick={() => setSteps((current) => [...current, { id: uuid(), text: '', done: false }])} data-testid="task-step-add">
                Adicionar micro-passo
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  )
}
