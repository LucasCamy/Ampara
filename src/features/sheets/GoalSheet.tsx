import { useState, type FormEvent } from 'react'
import { DateField } from '../../components/pickers'
import { FieldError, Switch, TextField } from '../../components/ui'
import { isDateKey } from '../../domain/catalog'
import { addDays, toDateKey } from '../../domain/dates'
import { useNow } from '../../store/clock'
import { dataStore } from '../../store/data'
import { deleteGoal, saveGoal } from '../../store/togetherActions'
import { MoneyInput } from '../finance/GoalsSection'
import { DeleteButton } from './fields'
import { SHEET_FORM } from './forms'

export function GoalSheet({ id, onDone }: { id?: string; onDone: () => void }) {
  const today = toDateKey(useNow())
  const prev = id ? dataStore.get().savingsGoals[id] : undefined
  const [title, setTitle] = useState(prev?.title ?? '')
  const [target, setTarget] = useState(prev?.targetCents ?? 0)
  const [deadline, setDeadline] = useState<string | null>(prev?.deadline ?? null)
  const [errors, setErrors] = useState<{ title?: string; target?: string; deadline?: string }>({})

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next = {
      title: title.trim() ? undefined : 'Dê um nome (ex.: Viagem para a praia).',
      target: target > 0 ? undefined : 'Quanto vocês querem juntar?',
      deadline: deadline !== null && (!isDateKey(deadline) || deadline <= today) ? 'O prazo precisa ser uma data futura.' : undefined,
    }
    setErrors(next)
    if (next.title || next.target || next.deadline) return
    if (saveGoal({ title, targetCents: target, deadline }, id)) onDone()
  }

  return (
    <form id={SHEET_FORM.goal} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <TextField
        label="Nome da caixinha"
        value={title}
        onChange={(v) => {
          setTitle(v)
          setErrors((er) => ({ ...er, title: undefined }))
        }}
        error={errors.title}
        placeholder="Ex.: Viagem para a praia"
        maxLength={60}
        testId="goal-title"
        autoFocus={!id}
      />
      <div>
        <MoneyInput
          cents={target}
          onChange={(c) => {
            setTarget(c)
            setErrors((er) => ({ ...er, target: undefined }))
          }}
          label="Meta"
          testId="goal-target"
        />
        {errors.target ? <FieldError>{errors.target}</FieldError> : null}
      </div>
      <Switch
        checked={deadline !== null}
        onChange={(on) => setDeadline(on ? addDays(today, 180) : null)}
        testId="goal-has-deadline"
        label="Tem prazo"
        description="Mostra quanto guardar por mês para chegar lá."
      />
      {deadline !== null ? <DateField label="Até quando" value={deadline} onChange={setDeadline} error={errors.deadline} testId="goal-deadline" /> : null}
      {id ? <DeleteButton label="Excluir caixinha" testId="goal-delete" onClick={() => deleteGoal(id) && onDone()} /> : null}
    </form>
  )
}
