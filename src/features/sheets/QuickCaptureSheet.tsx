import { CalendarDays, Lightbulb, ListTodo, Mic, Package, ReceiptText, ShoppingCart, Square } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { CATEGORIES } from '../../components/categories'
import { Button, ChoiceChips, cx, FieldError, StatusBadge, TextField } from '../../components/ui'
import { relativeDayLabel, toDateKey } from '../../domain/dates'
import { formatCents } from '../../domain/format'
import { defaultSplitRule } from '../../domain/finance'
import { parseQuickInput } from '../../domain/quickParse'
import { SHOP_CATEGORY, SHOP_ORDER } from '../../domain/shopping'
import type { ShopCategory } from '../../domain/types'
import { addTask } from '../../store/actions'
import { useNow } from '../../store/clock'
import { saveEntry } from '../../store/financeActions'
import { useCouple, useIsSolo, usePeople } from '../../store/hooks'
import { addShoppingItem } from '../../store/shoppingActions'
import { captureThought, deletePendingCapture } from '../../store/ideaActions'
import { looksLikeThought } from '../../domain/ideas'
import { ui } from '../../store/ui'
import { canDictate, startDictation, type DictationSession } from '../voice/speech'
import { SHEET_FORM } from './forms'

export function QuickCaptureSheet({ params, onDone }: { params: Record<string, string>; onDone: () => void }) {
  const { viewer, me } = usePeople()
  const ideasOn = me.enabledModules?.ideas !== false
  const [usedVoice, setUsedVoice] = useState(false)
  const [asTask, setAsTask] = useState(false)
  const isSolo = useIsSolo()
  const couple = useCouple()
  const today = toDateKey(useNow())
  const [raw, setRaw] = useState(params.raw ?? params.text ?? '')
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [shoppingDraft, setShoppingDraft] = useState<{ title: string; category: ShopCategory } | null>(null)
  const [shoppingError, setShoppingError] = useState<string | undefined>()
  const recognition = useRef<DictationSession | null>(null)
  const mounted = useRef(true)
  const id = useId()
  const parsed = useMemo(() => parseQuickInput(raw, today), [raw, today])
  const thought = ideasOn && !asTask && (!parsed || (parsed.kind === 'task' && !parsed.dueDate && looksLikeThought(raw)))
  const preview = thought ? null : parsed?.kind === 'shopping' && shoppingDraft ? { ...parsed, ...shoppingDraft } : parsed
  const scope = isSolo ? 'PERSONAL' : 'COUPLE'

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      recognition.current?.abort()
      recognition.current = null
    }
  }, [])

  const stopDictation = () => {
    recognition.current?.abort()
    recognition.current = null
    setListening(false)
  }

  const dictate = () => {
    if (listening) {
      recognition.current?.stop()
      // Mantém a referência até o fim: editar ou fechar ainda pode cancelar o resultado final pendente.
      setListening(false)
      return
    }
    recognition.current?.abort()
    recognition.current = null
    const prefix = raw.trim()
    setVoiceError(null)
    setError(null)
    recognition.current = startDictation({
      onTranscript: (text) => {
        if (!mounted.current) return
        setRaw(prefix ? `${prefix} ${text}` : text)
        setShoppingDraft(null)
        setUsedVoice(true)
      },
      onListeningChange: (active) => { if (mounted.current) setListening(active) },
      onError: (message) => { if (mounted.current) setVoiceError(message) },
    })
  }

  /** Campo único (ADR-0001): o que não é gasto, compra ou tarefa vira pensamento para organizar depois. */
  const saveAsIdea = () => {
    stopDictation()
    const id = captureThought(raw, usedVoice ? 'VOZ' : 'TEXTO')
    if (!id) {
      setError('Escreva ou dite o que você quer guardar.')
      return
    }
    ui.toast('Guardado em Ideias, na Caixa de entrada', { undo: () => { deletePendingCapture(id) }, action: { label: 'Ver', onClick: () => ui.setTab('ideias') } })
    onDone()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    stopDictation()
    if (thought && raw.trim()) {
      saveAsIdea()
      return
    }
    if (!preview) {
      setError(raw.trim() ? 'Confira a frase e o valor, ou escreva uma tarefa para começar.' : 'Escreva ou dite o que você quer guardar.')
      return
    }
    let saved: boolean
    if (preview.kind === 'expense') {
      saved = saveEntry({
        amountCents: preview.amountCents,
        description: preview.description,
        category: preview.category,
        date: preview.date,
        scope,
        paidBy: viewer,
        splitRule: defaultSplitRule(couple),
        isSecretGift: false,
        status: 'CONFIRMED_SOLID',
        repeat: 'ONCE',
      })
    } else if (preview.kind === 'shopping') {
      if (!preview.title.trim()) {
        setShoppingError('Escreva o que falta na lista.')
        return
      }
      saved = addShoppingItem(preview.title, preview.category, null, true)
    } else {
      saved = !!addTask({ title: preview.title, dest: 'ME', when: 'TODAY', dueDate: preview.dueDate, effort: preview.effort })
    }
    if (saved) onDone()
  }

  const edit = () => {
    if (!preview) return
    stopDictation()
    if (preview.kind === 'expense') {
      ui.openSheet('expense', { amount: String(preview.amountCents / 100), title: preview.description, category: preview.category, date: preview.date, scope })
    } else if (preview.kind === 'task') {
      ui.openSheet('task', { title: preview.title, date: preview.dueDate ?? '', when: preview.dueDate ? 'TODAY' : 'INBOX', effort: preview.effort })
    } else {
      setShoppingDraft({ title: preview.title, category: preview.category })
    }
  }

  return (
    <form id={SHEET_FORM.quickCapture} onSubmit={submit} noValidate className="flex flex-col gap-5 pt-2">
      <div>
        <label htmlFor={`${id}-input`} className="mb-2 block text-[14px] font-semibold text-ink">Conte do seu jeito</label>
        <textarea
          id={`${id}-input`}
          data-testid="quick-input"
          data-autofocus
          rows={4}
          maxLength={500}
          value={raw}
          onChange={(event) => {
            stopDictation()
            setRaw(event.target.value)
            setError(null)
            setShoppingDraft(null)
            setShoppingError(undefined)
            setAsTask(false)
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          placeholder="Ex.: gastei 35 na farmácia, comprar leite ou ligar na clínica amanhã"
          className={cx('min-h-28 w-full resize-y rounded-[16px] border bg-bg px-4 py-3 text-[16px] leading-relaxed text-ink placeholder:text-muted', error ? 'border-err' : 'border-line-strong')}
        />
        {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">Uma frase por vez. Você pode digitar ou usar o microfone do teclado do iPhone. A frase é interpretada neste aparelho.</p>
      </div>

      {canDictate() ? (
        <div>
          <Button type="button" variant="quiet" icon={listening ? Square : Mic} onClick={dictate} aria-pressed={listening} data-testid="quick-mic" className="w-full">
            {listening ? 'Parar ditado' : 'Ditar pelo navegador'}
          </Button>
          <p className="mt-1.5 text-[13px] text-muted" aria-live="polite">{listening ? 'Ouvindo. Você continua podendo editar o texto.' : 'O ditado usa o recurso de voz do seu navegador.'}</p>
        </div>
      ) : null}
      {voiceError ? <FieldError>{voiceError}</FieldError> : null}

      {preview ? (
        <section className={cx('rounded-[20px] p-4', preview.kind === 'expense' ? 'ledger-solid' : 'ledger-dashed')} aria-labelledby={`${id}-preview`} data-testid="quick-preview">
          <h2 id={`${id}-preview`} className="mb-3 text-[15px] font-bold text-ink">Entendi assim</h2>
          <StatusBadge kind={preview.kind === 'expense' ? 'ok' : 'pending'}>
            {preview.kind === 'expense' ? (isSolo ? 'Seu gasto pago' : 'Gasto do casal pago') : preview.kind === 'shopping' ? 'Item para comprar' : 'Sua tarefa pendente'}
          </StatusBadge>
          <p className="mt-3 flex items-start gap-2 text-[16px] font-semibold break-words text-ink">
            {preview.kind === 'expense' ? <ReceiptText size={19} aria-hidden className="mt-0.5 shrink-0" /> : preview.kind === 'shopping' ? <ShoppingCart size={19} aria-hidden className="mt-0.5 shrink-0" /> : <ListTodo size={19} aria-hidden className="mt-0.5 shrink-0" />}
            {preview.kind === 'expense' ? preview.description : preview.title}
          </p>
          {preview.kind === 'expense' ? (
            <>
              <p className="font-data mt-2 text-[22px] font-semibold text-ink">{formatCents(preview.amountCents)}</p>
              <p className="mt-1 text-[14px] text-muted">{CATEGORIES[preview.category].label} · <span className="font-data">{relativeDayLabel(preview.date, today)}</span></p>
            </>
          ) : preview.kind === 'shopping' ? (
            <p className="mt-2 text-[14px] text-muted">Lista de compras · {SHOP_CATEGORY[preview.category].label}</p>
          ) : (
            <p className="mt-2 flex items-center gap-2 text-[14px] text-muted">
              <CalendarDays size={16} aria-hidden />
              <span>{preview.dueDate ? <span className="font-data">{relativeDayLabel(preview.dueDate, today)}</span> : 'Caixa de Entrada'} · {preview.effort === 'FOCUS' ? 'Foco' : <span>Rápida <span className="font-data">5 min</span></span>}</span>
            </p>
          )}
          <Button type="button" variant="quiet" className="mt-4 w-full" onClick={edit} data-testid="quick-edit" aria-expanded={preview.kind === 'shopping' ? !!shoppingDraft : undefined}>Editar detalhes</Button>
        </section>
      ) : thought && raw.trim() ? (
        <section className="ledger-dashed rounded-[20px] p-4" data-testid="quick-idea-preview">
          <h2 className="mb-3 text-[15px] font-bold text-ink">Entendi assim</h2>
          <StatusBadge kind="pending">Pensamento para organizar</StatusBadge>
          <p className="mt-3 flex items-start gap-2 text-[16px] font-semibold break-words text-ink"><Lightbulb size={19} aria-hidden className="mt-0.5 shrink-0" />Vai para Ideias, na Caixa de entrada</p>
          <p className="mt-2 text-[14px] text-muted">Parece um pensamento, não uma tarefa. Fica guardado só para você.</p>
          {parsed ? <Button type="button" variant="quiet" className="mt-4 w-full" onClick={() => setAsTask(true)} data-testid="quick-as-task">É uma tarefa</Button> : null}
        </section>
      ) : (
        <p className="rounded-[18px] bg-subtle p-4 text-[14px] text-muted">Escreva uma frase para ver a prévia antes de salvar.</p>
      )}
      {preview && ideasOn ? (
        <Button type="button" variant="quiet" icon={Lightbulb} onClick={saveAsIdea} data-testid="quick-as-idea" className="w-full">Guardar como ideia</Button>
      ) : null}

      {preview?.kind === 'shopping' && shoppingDraft ? (
        <div className="flex flex-col gap-4 rounded-[20px] border border-line p-4" data-testid="quick-shopping-details">
          <TextField label="O que falta?" value={shoppingDraft.title} maxLength={80} error={shoppingError} onChange={(title) => { setShoppingDraft((current) => current ? { ...current, title } : current); setShoppingError(undefined) }} />
          <ChoiceChips<ShopCategory> label="Onde comprar" value={shoppingDraft.category} onChange={(category) => setShoppingDraft((current) => current ? { ...current, category } : current)} options={SHOP_ORDER.map((category) => ({ value: category, label: SHOP_CATEGORY[category].label, icon: Package }))} />
        </div>
      ) : null}
    </form>
  )
}
