import { CircleCheck, CircleDashed, Gift, User, Users } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { CATEGORIES, CATEGORY_ORDER } from '../../components/categories'
import { ChoiceChips, cx, FieldError, Switch } from '../../components/ui'
import { computeShares, defaultSplitRule } from '../../domain/finance'
import { digitsToCents, formatCents, parseMoneyToCents } from '../../domain/format'
import type { PartnerId, SplitRule, TxCategory, TxStatus } from '../../domain/types'
import { addExpense } from '../../store/actions'
import { useCouple, usePeople } from '../../store/hooks'
import { SHEET_FORM } from './forms'

/** Máscara de caixa eletrônico: os dígitos sempre entram pela direita */
const caretToEnd = (e: { currentTarget: HTMLInputElement }) => {
  const el = e.currentTarget
  const end = el.value.length
  if (el.selectionStart !== end || el.selectionEnd !== end) el.setSelectionRange(end, end)
}

export function ExpenseSheet({ params, onDone }: { params: Record<string, string>; onDone: () => void }) {
  const { viewer, partnerId, partner, me } = usePeople()
  const couple = useCouple()
  const initialCents = params.amount ? (parseMoneyToCents(params.amount) ?? 0) : 0
  const [cents, setCents] = useState(initialCents)
  const [description, setDescription] = useState(params.title ?? '')
  const [category, setCategory] = useState<TxCategory>('MARKET')
  const [scope, setScope] = useState<'COUPLE' | 'PERSONAL'>(params.scope === 'PERSONAL' ? 'PERSONAL' : 'COUPLE')
  const [paidBy, setPaidBy] = useState<PartnerId>(viewer)
  const [rule, setRule] = useState<SplitRule>(defaultSplitRule(couple))
  const [gift, setGift] = useState(false)
  const [status, setStatus] = useState<TxStatus>('CONFIRMED_SOLID')
  const [errors, setErrors] = useState<{ amount?: string; description?: string }>({})
  const id = useId()

  const ratioA = couple.ratioABps / 100
  const ratioLabel = viewer === 'A' ? `${ratioA}/${100 - ratioA}` : `${100 - ratioA}/${ratioA}`
  const preview = useMemo(() => {
    if (scope !== 'COUPLE' || cents <= 0) return null
    const s = computeShares(cents, rule, paidBy, couple.ratioABps)
    return { mine: viewer === 'A' ? s.partnerAShareCents : s.partnerBShareCents, theirs: viewer === 'A' ? s.partnerBShareCents : s.partnerAShareCents }
  }, [scope, cents, rule, paidBy, couple.ratioABps, viewer])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (cents <= 0) next.amount = 'Informe um valor maior que R$ 0,00.'
    const desc = description.trim() || CATEGORIES[category].label
    setErrors(next)
    if (next.amount) return
    addExpense({ amountCents: cents, description: desc, category, scope, paidBy, splitRule: rule, isSecretGift: scope === 'PERSONAL' && gift, status })
    onDone()
  }

  return (
    <form id={SHEET_FORM.expense} onSubmit={submit} className="flex flex-col gap-5 pt-2" noValidate>
      <div>
        <label htmlFor={`${id}-v`} className="mb-2 block text-[14px] font-semibold text-ink">
          Valor
        </label>
        <input
          id={`${id}-v`}
          data-autofocus
          inputMode="numeric"
          autoComplete="off"
          data-testid="expense-amount"
          onFocus={caretToEnd}
          onClick={caretToEnd}
          onKeyDown={caretToEnd}
          onSelect={caretToEnd}
          value={formatCents(cents)}
          onChange={(e) => {
            setCents(digitsToCents(e.target.value))
            if (errors.amount) setErrors((x) => ({ ...x, amount: undefined }))
          }}
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={errors.amount ? `${id}-verr` : `${id}-vhelp`}
          className={cx(
            'font-data min-h-16 w-full rounded-[18px] border bg-bg px-4 text-[30px] font-semibold text-ink',
            errors.amount ? 'border-err' : 'border-line-strong',
          )}
        />
        {errors.amount ? (
          <FieldError id={`${id}-verr`}>{errors.amount}</FieldError>
        ) : (
          <p id={`${id}-vhelp`} className="mt-1.5 text-[13px] text-muted">
            Digite só os números: 1250 vira R$ 12,50.
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${id}-d`} className="mb-2 block text-[14px] font-semibold text-ink">
          Descrição <span className="font-medium text-muted">(opcional)</span>
        </label>
        <input
          id={`${id}-d`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={60}
          autoComplete="off"
          data-testid="expense-description"
          placeholder={`Ex.: ${CATEGORIES[category].label}`}
          className="min-h-14 w-full rounded-[16px] border border-line-strong bg-bg px-4 text-[16px] text-ink placeholder:text-muted"
        />
      </div>

      <ChoiceChips<TxCategory>
        label="Categoria"
        value={category}
        onChange={setCategory}
        options={CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORIES[c].label, icon: CATEGORIES[c].icon }))}
      />

      <ChoiceChips<'COUPLE' | 'PERSONAL'>
        label="De quem é o gasto"
        value={scope}
        onChange={setScope}
        options={[
          { value: 'COUPLE', label: 'Do casal', icon: Users },
          { value: 'PERSONAL', label: 'Só meu', icon: User },
        ]}
      />

      {scope === 'COUPLE' ? (
        <div className="flex flex-col gap-5 rounded-[20px] bg-subtle p-4">
          <ChoiceChips<PartnerId>
            label="Quem pagou?"
            value={paidBy}
            onChange={setPaidBy}
            options={[
              { value: viewer, label: 'Eu paguei' },
              { value: partnerId, label: `${partner.displayName} pagou` },
            ]}
          />
          <ChoiceChips<SplitRule>
            label="Como dividir?"
            value={rule}
            onChange={setRule}
            options={[
              { value: '50_50', label: '50/50' },
              { value: 'PROPORTIONAL', label: `Proporcional ${ratioLabel}`, hint: 'pela renda' },
              { value: 'FULL_FOR_PARTNER', label: '100% do outro', hint: 'adiantamento' },
            ]}
          />
          {preview ? (
            <p className="text-[14px] text-ink" data-testid="expense-preview">
              Sua parte: <span className="font-data font-semibold whitespace-nowrap">{formatCents(preview.mine)}</span> · Parte de {partner.displayName}:{' '}
              <span className="font-data font-semibold whitespace-nowrap">{formatCents(preview.theirs)}</span>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-[20px] bg-subtle p-4">
          <Switch
            checked={gift}
            onChange={setGift}
            testId="expense-gift"
            label={
              <span className="inline-flex items-center gap-2">
                <Gift size={17} aria-hidden className="text-couple" /> Presente / Surpresa
              </span>
            }
            description={`Fica oculto para ${partner.displayName}, mesmo com a transparência ligada. ${me.sharePersonalFinances ? '' : 'Sua aba pessoal já está fechada agora.'}`}
          />
        </div>
      )}

      <ChoiceChips<TxStatus>
        label="Situação"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'CONFIRMED_SOLID', label: 'Pago', hint: 'traço sólido', icon: CircleCheck },
          { value: 'PREDICTED_DASHED', label: 'Previsto', hint: 'traço tracejado', icon: CircleDashed },
        ]}
      />
    </form>
  )
}
