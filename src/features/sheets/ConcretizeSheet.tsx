import { CalendarDays, ListTodo, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FieldError, Segmented, TextField } from '../../components/ui'
import { currentProvider } from '../../ai/provider'
import { toDateKey } from '../../domain/dates'
import { MAX_STEPS, defaultDraft, type ActionDraft, type TaskWhen } from '../../domain/ideasConcretize'
import type { TaskEffort } from '../../domain/types'
import { useNow } from '../../store/clock'
import { useData } from '../../store/data'
import { concretizeIdea } from '../../store/ideaActions'
import { suggestAction } from '../../store/ideaAi'
import { ui } from '../../store/ui'
import { SHEET_FORM } from './forms'

type Kind = ActionDraft['kind']

/**
 * "Isso vai acontecer" (ADR-0001): a IA sugere uma forma (tarefa com micro-passos ou compromisso); a pessoa
 * confere, ajusta e confirma. Nada é criado antes do botão.
 */
export function ConcretizeSheet({ ideaId, onDone }: { ideaId: string; onDone: () => void }) {
  const today = toDateKey(useNow())
  const idea = useData((s) => s.ideas[ideaId])!
  const provider = currentProvider()
  const base = defaultDraft(idea)
  const [kind, setKind] = useState<Kind>('TASK')
  const [title, setTitle] = useState(base.title)
  const [steps, setSteps] = useState<string[]>(['', '', ''])
  const [effort, setEffort] = useState<TaskEffort>('QUICK_5M')
  const [when, setWhen] = useState<TaskWhen>('INBOX')
  const [date, setDate] = useState(today)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [reason, setReason] = useState('')
  const [thinking, setThinking] = useState(!!provider)
  const [error, setError] = useState<string | null>(null)
  const touched = useRef(false)

  useEffect(() => {
    if (!provider) return
    let alive = true
    suggestAction(ideaId, today, provider)
      .then((d) => {
        // se a pessoa já começou a mexer, a sugestão não apaga o que ela escreveu
        if (!alive || touched.current) return
        setKind(d.kind)
        setTitle(d.title)
        setReason(d.reason)
        if (d.kind === 'TASK') {
          setSteps([...d.steps, '', '', ''].slice(0, MAX_STEPS))
          setEffort(d.effort)
          setWhen(d.when)
        } else {
          setDate(d.date)
          setStart(d.start)
          setEnd(d.end)
        }
      })
      .catch((e: unknown) => { if (alive) setError(`${e instanceof Error ? e.message : 'A IA não respondeu.'} Preencha do seu jeito.`) })
      .finally(() => { if (alive) setThinking(false) })
    return () => { alive = false }
    // a sugestão é pedida uma vez, ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const touch = () => { touched.current = true }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const draft: ActionDraft = kind === 'TASK'
      ? { kind, title, steps, effort, when, reason }
      : { kind, title, date, start, end, reason }
    const result = concretizeIdea(ideaId, draft, today)
    if (!result.ok) {
      setError(result.error)
      return
    }
    ui.toast(kind === 'TASK' ? `Virou tarefa: ${title.trim()}` : `Virou compromisso: ${title.trim()}`, {
      undo: result.undo,
      action: { label: 'Ver', onClick: () => ui.openSheet(kind === 'TASK' ? 'task' : 'event', { id: result.targetId! }) },
    })
    onDone()
  }

  return (
    <form id={SHEET_FORM.concretize} onSubmit={submit} noValidate className="flex flex-col gap-5 pt-2" data-testid="concretize-form">
      <p className="rounded-[18px] bg-subtle p-4 text-[15px] text-ink">
        <span className="text-muted">Ideia: </span><strong>{idea.title}</strong>
      </p>

      {thinking ? (
        <p role="status" className="flex items-center gap-2 text-[14px] font-semibold text-ink" data-testid="concretize-thinking">
          <Sparkles size={16} aria-hidden className="text-action" />A IA está pensando no melhor jeito de começar…
        </p>
      ) : reason ? (
        <p className="ledger-dashed rounded-[18px] p-3 text-[14px] text-ink" data-testid="concretize-reason">
          <Sparkles size={15} aria-hidden className="mr-1.5 inline text-action" />Sugestão da IA: {reason}
        </p>
      ) : null}

      <Segmented<Kind>
        label="Vai virar"
        hideLabel={false}
        value={kind}
        onChange={(v) => { touch(); setKind(v); setError(null) }}
        fill
        options={[
          { value: 'TASK', label: 'Tarefa', icon: ListTodo, testId: 'concretize-task' },
          { value: 'EVENT', label: 'Compromisso', icon: CalendarDays, testId: 'concretize-event' },
        ]}
      />

      <TextField label={kind === 'TASK' ? 'O que fazer' : 'Compromisso'} value={title} onChange={(v) => { touch(); setTitle(v); setError(null) }} maxLength={kind === 'TASK' ? 120 : 80} />

      {kind === 'TASK' ? (
        <>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-[14px] font-semibold text-ink">Micro-passos <span className="font-normal text-muted">(opcional; o primeiro bem pequeno)</span></legend>
            {steps.map((step, i) => (
              <TextField
                key={i}
                label={`Passo ${i + 1}`}
                value={step}
                maxLength={120}
                onChange={(v) => { touch(); setSteps((cur) => cur.map((s, j) => (j === i ? v : s))) }}
              />
            ))}
          </fieldset>
          <Segmented<TaskEffort>
            label="Esforço"
            hideLabel={false}
            value={effort}
            onChange={(v) => { touch(); setEffort(v) }}
            fill
            options={[{ value: 'QUICK_5M', label: 'Rápida (5 min)' }, { value: 'FOCUS', label: 'Foco' }]}
          />
          <Segmented<TaskWhen>
            label="Quando"
            hideLabel={false}
            value={when}
            onChange={(v) => { touch(); setWhen(v) }}
            fill
            options={[
              { value: 'TODAY', label: 'Hoje', testId: 'concretize-today' },
              { value: 'TOMORROW', label: 'Amanhã' },
              { value: 'INBOX', label: 'Sem data', testId: 'concretize-inbox' },
            ]}
          />
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextField label="Dia" type="date" value={date} onChange={(v) => { touch(); setDate(v) }} />
          <TextField label="Início" type="time" value={start} onChange={(v) => { touch(); setStart(v) }} />
          <TextField label="Fim" type="time" value={end} onChange={(v) => { touch(); setEnd(v) }} />
        </div>
      )}
      {error ? <FieldError>{error}</FieldError> : null}
      <p className="text-[13px] text-muted">A ideia continua guardada e fica ligada {kind === 'TASK' ? 'à tarefa' : 'ao compromisso'}. Só você vê de onde veio.</p>
    </form>
  )
}
