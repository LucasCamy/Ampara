import { useState, type FormEvent } from 'react'
import { FieldError, TextField } from '../../components/ui'
import { dataStore } from '../../store/data'
import { endRule, saveRule } from '../../store/financeActions'
import { MoneyInput } from '../finance/GoalsSection'
import { DeleteButton } from './fields'
import { SHEET_FORM } from './forms'

/** Editar conta fixa: vale para este mês em diante (o que já foi pago não muda) */
export function RuleSheet({ id, onDone }: { id: string; onDone: () => void }) {
  const prev = dataStore.get().recurrences[id]
  const [description, setDescription] = useState(prev?.description ?? '')
  const [cents, setCents] = useState(prev?.amountCents ?? 0)
  const [day, setDay] = useState(String(prev?.dayOfMonth ?? 1))
  const [errors, setErrors] = useState<{ description?: string; amount?: string; day?: string }>({})
  if (!prev) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const d = Number(day)
    const next = {
      description: description.trim() ? undefined : 'Dê um nome (ex.: Aluguel).',
      amount: cents > 0 ? undefined : 'Informe o valor.',
      day: /^\d{1,2}$/.test(day) && d >= 1 && d <= 31 ? undefined : 'Um dia de 1 a 31.',
    }
    setErrors(next)
    if (next.description || next.amount || next.day) return
    if (saveRule(id, { description, amountCents: cents, dayOfMonth: d })) onDone()
  }

  return (
    <form id={SHEET_FORM.rule} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <TextField label="Nome" value={description} onChange={setDescription} error={errors.description} maxLength={60} testId="rule-description" />
      <div>
        <MoneyInput cents={cents} onChange={setCents} label="Valor por mês" testId="rule-amount" />
        {errors.amount ? <FieldError>{errors.amount}</FieldError> : null}
      </div>
      <TextField
        label="Dia do vencimento"
        value={day}
        onChange={(v) => setDay(v.replace(/\D/g, '').slice(0, 2))}
        error={errors.day}
        inputMode="numeric"
        data
        hint="Mês curto usa o último dia."
        testId="rule-day"
        className="max-w-[200px]"
      />
      <p className="text-[13px] text-muted">Muda as previstas deste mês em diante. As já pagas ficam como foram.</p>
      <DeleteButton label="Encerrar conta fixa" testId="rule-end" onClick={() => endRule(id) && onDone()} />
    </form>
  )
}
