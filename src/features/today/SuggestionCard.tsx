import { Archive, ArrowRight, CalendarDays, Lightbulb, ListChecks, Repeat, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { authStore } from '../../auth/session'
import { Button, StatusBadge } from '../../components/ui'
import { formatCents } from '../../domain/format'
import { pickTopSuggestion, type DiscoveryTip, type Suggestion } from '../../domain/suggestions'
import { addTask, archiveTasks } from '../../store/actions'
import { useNow } from '../../store/clock'
import { dataStore, useData } from '../../store/data'
import { usePeople } from '../../store/hooks'
import { dismissSuggestion, suggestionScope, useSuggestionDismissals } from '../../store/suggestions'
import { ui, useUi } from '../../store/ui'

const DISCOVERY: Record<DiscoveryTip, { title: string; text: string; action: string }> = {
  reading: { title: 'Uma leitura mais confortável', text: 'Você pode experimentar Lexend, Atkinson e mais espaço entre as linhas.', action: 'Ajustar leitura' },
  voice: { title: 'Uma frase já é um começo', text: 'Escreva ou dite uma ideia. A captura livre organiza uma prévia para você conferir.', action: 'Experimentar captura' },
  routines: { title: 'Apoio para as pequenas rotinas', text: 'Água, chaves e pausas podem ganhar um lembrete simples. Há ideias prontas para começar.', action: 'Ver ideias' },
}

function Title({ suggestion }: { suggestion: Suggestion }) {
  switch (suggestion.kind) {
    case 'postponed-task': return <>Talvez caiba um passo menor</>
    case 'recurring-expense': return <>Este gasto pode virar conta fixa</>
    case 'event-preparation': return <>Um preparo pequeno pode ajudar</>
    case 'comfort-kit': return <>Um kit para dias difíceis</>
    case 'discovery': return <>{DISCOVERY[suggestion.payload.tip].title}</>
  }
}

function Description({ suggestion }: { suggestion: Suggestion }) {
  switch (suggestion.kind) {
    case 'postponed-task': return <>“{suggestion.payload.title}” foi adiada algumas vezes. Você pode escolher um começo pequeno ou deixar essa tarefa ir.</>
    case 'recurring-expense': return <>“{suggestion.payload.description}” apareceu em meses diferentes. Você pode prever <span className="font-data whitespace-nowrap">{formatCents(suggestion.payload.amountCents)}</span> por mês e ajustar antes de salvar.</>
    case 'event-preparation': return <>“{suggestion.payload.eventTitle}” está chegando. Separe um momento para lembrar do que levar ou organizar.</>
    case 'comfort-kit': return <>Anotar o que ajuda num dia bom pode aliviar os dias com menos energia. Uma ideia já basta.</>
    case 'discovery': return <>{DISCOVERY[suggestion.payload.tip].text}</>
  }
}

/** No máximo uma sugestão por visita; dispensar nunca desencadeia uma fila de novas dicas. */
export function SuggestionCard() {
  const state = useData((s) => s)
  const { viewer, me } = usePeople()
  const now = useNow()
  const readingFont = useUi((s) => s.readingFont)
  const scope = suggestionScope(state)
  const { ready, dismissals } = useSuggestionDismissals(scope, viewer)
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const held = useRef<Suggestion | null>(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const picked = useMemo(() => ready ? pickTopSuggestion(state, viewer, now, { dismissals, readingFont }) : null, [state, viewer, now, ready, dismissals, readingFont])
  const suggestion = pending.current ? held.current : picked
  if (hidden || me.energy === 'OVERLOAD' || !suggestion) return null

  const done = async (run?: () => void) => {
    if (pending.current) return
    held.current = suggestion
    pending.current = true
    setBusy(true)
    try {
      await dismissSuggestion(scope, viewer, suggestion.id)
    } catch {
      ui.toast('Sugestão dispensada só nesta sessão.', { tone: 'info' })
    }
    if (!active.current || authStore.get().who !== viewer || suggestionScope(dataStore.get()) !== scope) return
    setHidden(true)
    run?.()
  }
  const discover = (tip: DiscoveryTip) => {
    if (tip === 'voice') return ui.openSheet('quickCapture')
    if (tip === 'routines') return ui.openSheet('templates', { group: 'routines' })
    ui.openSettings('aparelho')
  }
  const primary = () => {
    switch (suggestion.kind) {
      case 'postponed-task': return ui.openSheet('task', { id: suggestion.payload.taskId, stepsOpen: '1' })
      case 'recurring-expense': return ui.openSheet('rule', { transactionId: suggestion.payload.transactionId })
      case 'event-preparation': return void addTask({ title: suggestion.payload.prepTitle, dest: 'ME', when: 'TODAY', dueDate: suggestion.payload.dueDate, effort: 'QUICK_5M', private: true })
      case 'comfort-kit': return ui.openSheet('templates', { group: 'comfort' })
      case 'discovery': return discover(suggestion.payload.tip)
    }
  }
  const action = suggestion.kind === 'postponed-task' ? 'Quebrar em primeiro passo' : suggestion.kind === 'recurring-expense' ? 'Criar conta fixa' : suggestion.kind === 'event-preparation' ? 'Criar tarefa de preparo' : suggestion.kind === 'comfort-kit' ? 'Montar meu kit' : DISCOVERY[suggestion.payload.tip].action
  return (
    <section className="module border border-line-strong p-4 sm:p-5" aria-labelledby="suggestion-title" data-testid="suggestion-card" data-suggestion-id={suggestion.id}>
      <div className="flex items-start justify-between gap-2">
        <StatusBadge kind="pending"><Lightbulb size={14} aria-hidden /> Uma ideia, se ajudar</StatusBadge>
        <button type="button" className="press hoverable -mt-2 -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted" aria-label="Dispensar esta sugestão por uma semana" aria-busy={busy} disabled={busy} data-testid="suggestion-dismiss" onClick={() => void done()}><X size={18} aria-hidden /></button>
      </div>
      <h2 id="suggestion-title" className="mt-2 text-[17px] font-bold text-ink"><Title suggestion={suggestion} /></h2>
      <p className="mt-2 text-[14px] text-muted"><Description suggestion={suggestion} /></p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="quiet" busy={busy} icon={suggestion.kind === 'postponed-task' ? ListChecks : suggestion.kind === 'recurring-expense' ? Repeat : suggestion.kind === 'event-preparation' ? CalendarDays : ArrowRight} className="grow basis-[180px]" data-testid="suggestion-primary" onClick={() => void done(primary)}>{action}</Button>
        {suggestion.kind === 'postponed-task' ? <Button variant="ghost" disabled={busy} icon={Archive} className="grow basis-[160px]" data-testid="suggestion-archive" onClick={() => void done(() => archiveTasks([suggestion.payload.taskId]))}>Arquivar sem culpa</Button> : null}
      </div>
    </section>
  )
}
