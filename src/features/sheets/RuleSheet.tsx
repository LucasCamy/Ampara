import { useState, type FormEvent } from 'react'
import { SearchX } from 'lucide-react'
import { ChoiceChips, EmptyState, FieldError, TextField } from '../../components/ui'
import { canViewRule } from '../../domain/ledger'
import type { SplitRule } from '../../domain/types'
import { dataStore } from '../../store/data'
import { createRuleFromTransaction, endRule, getRuleSourceTransaction, saveRule } from '../../store/financeActions'
import { useIsSolo, useViewer } from '../../store/hooks'
import { MoneyInput } from '../finance/GoalsSection'
import { DeleteButton } from './fields'
import { SHEET_FORM } from './forms'

/** Editar conta fixa: vale para este mês em diante (o que já foi pago não muda) */
export function RuleSheet({ id, params = {}, onDone }: { id?: string; params?: Record<string, string>; onDone: () => void }) {
  const viewer = useViewer()
  const isSolo = useIsSolo()
  const rule = id ? dataStore.get().recurrences[id] : undefined
  const prev = rule && canViewRule(rule, viewer) ? rule : undefined
  const [source] = useState(() => !id ? getRuleSourceTransaction(params.transactionId) : null)
  const [description, setDescription] = useState(prev?.description ?? source?.description ?? '')
  const [cents, setCents] = useState(prev?.amountCents ?? source?.amountCents ?? 0)
  const [day, setDay] = useState(String(prev?.dayOfMonth ?? (source ? Number(source.competenceDate.slice(8, 10)) : 1)))
  const [split, setSplit] = useState<Exclude<SplitRule, 'CUSTOM'>>(source?.splitRule && source.splitRule !== 'CUSTOM' ? source.splitRule : '50_50')
  const [formError, setFormError] = useState<string>()
  const [errors, setErrors] = useState<{ description?: string; amount?: string; day?: string }>({})
  if (!prev && !source) return <EmptyState icon={SearchX} title="Este gasto não está disponível." text="Ele pode ter mudado ou já estar ligado a uma conta fixa. Feche e confira seus lançamentos." />

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
    const saved = id ? saveRule(id, { description, amountCents: cents, dayOfMonth: d }) : source && createRuleFromTransaction(source.id, { description, amountCents: cents, dayOfMonth: d, splitRule: split })
    if (saved) onDone()
    else setFormError('Já existe uma conta fixa parecida ou este gasto mudou. Confira antes de salvar de novo.')
  }

  return (
    <form id={SHEET_FORM.rule} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <TextField label="Nome" value={description} onChange={setDescription} error={errors.description} maxLength={60} testId="rule-description" />
      <MoneyInput cents={cents} onChange={setCents} label="Valor por mês" testId="rule-amount" error={errors.amount} />
      <TextField
        label="Dia do vencimento"
        value={day}
        onChange={(v) => setDay(v.replace(/\D/g, '').slice(0, 2))}
        error={errors.day}
        inputMode="numeric"
        data
        hint="Mês curto usa o último dia."
        testId="rule-day"
      />
      {!id && !isSolo && source?.scope === 'COUPLE' ? <ChoiceChips<Exclude<SplitRule, 'CUSTOM'>> label="Divisão daqui em diante" value={split} onChange={setSplit} options={[{ value: '50_50', label: 'Meio a meio' }, { value: 'PROPORTIONAL', label: 'Proporcional à renda' }, { value: 'FULL_FOR_PARTNER', label: 'Tudo para o par' }]} /> : null}
      <p className="text-[13px] text-muted">{id ? 'Muda as previstas deste mês em diante. As já pagas ficam como foram.' : 'Começa no próximo mês. Os gastos já registrados continuam como foram.'}</p>
      {formError ? <FieldError>{formError}</FieldError> : null}
      {id ? <DeleteButton label="Encerrar conta fixa" testId="rule-end" onClick={() => endRule(id) && onDone()} /> : null}
    </form>
  )
}
