import { firstName } from '../../domain/format'
import { Brain, CalendarDays, Inbox, Lock, Mail, Sun, User, Users, Zap } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { ChoiceChips, cx, FieldError } from '../../components/ui'
import type { TaskEffort } from '../../domain/types'
import { addTask, type TaskDest, type TaskWhen } from '../../store/actions'
import { usePeople } from '../../store/hooks'
import { SHEET_FORM } from './forms'

export function TaskSheet({ params, onDone }: { params: Record<string, string>; onDone: () => void }) {
  const { partner } = usePeople()
  const [title, setTitle] = useState(params.title ?? '')
  const [dest, setDest] = useState<TaskDest>(params.scope === 'US' ? 'US' : 'ME')
  const [when, setWhen] = useState<TaskWhen>('TODAY')
  const [effort, setEffort] = useState<TaskEffort>('QUICK_5M')
  const [priv, setPriv] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Escreva o que precisa ser feito (uma frase curta basta).')
      return
    }
    addTask({ title, dest, when, effort, private: priv })
    onDone()
  }

  return (
    <form id={SHEET_FORM.task} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <div>
        <label htmlFor={`${id}-t`} className="mb-2 block text-[14px] font-semibold text-ink">
          O que precisa ser feito?
        </label>
        <input
          id={`${id}-t`}
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

      <ChoiceChips<TaskDest>
        label="Para quem"
        value={dest}
        onChange={setDest}
        options={[
          { value: 'ME', label: 'Meu', icon: User },
          { value: 'US', label: 'Nós', icon: Users },
          { value: 'PARTNER', label: `Enviar p/ ${firstName(partner.displayName)}`, icon: Mail },
        ]}
      />

      <ChoiceChips<TaskWhen>
        label="Quando"
        value={when}
        onChange={setWhen}
        options={[
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

      {dest === 'ME' ? (
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border border-line px-3.5 text-[14px] font-semibold text-ink">
          <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} className="h-5 w-5 accent-[var(--action)]" />
          <Lock size={16} aria-hidden className="text-muted" />
          Só eu vejo (não aparece no painel de {firstName(partner.displayName)})
        </label>
      ) : null}
    </form>
  )
}
