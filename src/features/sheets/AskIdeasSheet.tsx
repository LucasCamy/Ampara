import { CircleAlert, Lightbulb, Quote, Sparkles } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { cx, FieldError } from '../../components/ui'
import { currentProvider } from '../../ai/provider'
import { toDateKey } from '../../domain/dates'
import { ASK_LIMITS } from '../../domain/ideasAsk'
import { NATURE_LABEL } from '../../domain/ideasView'
import { useNow } from '../../store/clock'
import { askIdeas, type AskResult } from '../../store/ideaAi'
import { ui } from '../../store/ui'
import { shortDateTime } from '../ideas/ideaUi'
import { SHEET_FORM } from './forms'

/**
 * Perguntar às ideias (docs/08 seção 5): a resposta cita as anotações; toque numa citação abre a ideia.
 * Sem IA, mostra o que a busca achou. Perguntar nunca muda nada.
 */
export function AskIdeasSheet() {
  const id = useId()
  const today = toDateKey(useNow())
  const provider = currentProvider()
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AskResult | null>(null)
  const byId = useMemo(() => new Map(result?.found.map((f, i) => [f.note.id, { ...f, n: i + 1 }]) ?? []), [result])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!question.trim()) {
      setError('Escreva o que você quer saber.')
      return
    }
    setBusy(true)
    setError(null)
    askIdeas(question, today, provider)
      .then(setResult)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Não consegui perguntar agora.'))
      .finally(() => setBusy(false))
  }

  const openIdea = (ideaId: string | null | undefined) => {
    if (ideaId) ui.openSheet('idea', { id: ideaId })
  }

  const filterText = result ? [
    result.filters.nature ? NATURE_LABEL[result.filters.nature] : null,
    result.filters.since ? `desde ${result.filters.since.split('-').reverse().slice(0, 2).join('/')}` : null,
  ].filter(Boolean).join(' · ') : ''

  return (
    <form id={SHEET_FORM.askIdeas} onSubmit={submit} noValidate className="flex flex-col gap-5 pt-2" data-testid="ask-form">
      <div>
        <label htmlFor={`${id}-q`} className="mb-2 block text-[14px] font-semibold text-ink">O que você quer saber?</label>
        <textarea
          id={`${id}-q`}
          data-autofocus
          rows={2}
          maxLength={ASK_LIMITS.questionChars}
          value={question}
          onChange={(e) => { setQuestion(e.target.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }}
          placeholder="Ex.: o que eu já falei sobre correr? Quais preocupações tive este mês?"
          className="w-full resize-y rounded-[16px] border border-line-strong bg-bg px-4 py-3 text-[16px] leading-relaxed text-ink placeholder:text-muted"
          data-testid="ask-input"
        />
        <p className="mt-1.5 text-[13px] text-muted">{provider ? 'A IA responde só com o que você anotou e mostra de onde tirou.' : 'Sem IA neste aparelho: mostro as anotações que combinam com a pergunta.'}</p>
      </div>

      {busy ? <p role="status" className="flex items-center gap-2 text-[14px] font-semibold text-ink"><Sparkles size={16} aria-hidden className="text-action" />Procurando nas suas anotações…</p> : null}
      {error ? <FieldError>{error}</FieldError> : null}

      {result && !busy ? (
        <>
          {result.answer ? (
            <section aria-labelledby={`${id}-answer`} className="flex flex-col gap-2 rounded-[20px] border border-line p-4" data-testid="ask-answer">
              <h3 id={`${id}-answer`} className="text-[15px] font-bold text-ink">Resposta</h3>
              <ul className="flex flex-col gap-2.5">
                {result.answer.sentences.map((s, i) => (
                  <li key={i} className="text-[16px] leading-relaxed text-ink">
                    {s.text}{' '}
                    {s.sources.length ? s.sources.map((src) => {
                      const f = byId.get(src)
                      return f ? (
                        <button key={src} type="button" onClick={() => openIdea(f.idea?.id)} aria-label={`Fonte ${f.n}: ${f.idea?.title ?? 'Caixa de entrada'}`} className="press hoverable mx-0.5 inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border border-action px-2 align-middle text-[13px] font-bold text-action" data-testid="ask-source">
                          {f.n}
                        </button>
                      ) : null
                    }) : (
                      <span className="inline-flex items-center gap-1 align-middle text-[13px] font-semibold text-warn" data-testid="ask-unsourced"><CircleAlert size={14} aria-hidden />sem fonte</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby={`${id}-found`} className="flex flex-col gap-2">
            <h3 id={`${id}-found`} className="text-[15px] font-bold text-ink">
              {result.found.length ? `O que você anotou (${result.found.length})` : 'Nada encontrado nas suas anotações.'}
              {filterText ? <span className="font-normal text-muted"> · {filterText}</span> : null}
            </h3>
            {result.found.length ? (
              <ol className="flex flex-col gap-2" data-testid="ask-found">
                {result.found.map((f, i) => (
                  <li key={f.note.id}>
                    <button type="button" onClick={() => openIdea(f.idea?.id)} disabled={!f.idea} className={cx('flex w-full gap-3 rounded-[16px] border border-line p-3 text-left', f.idea && 'press hoverable')}>
                      <span className="font-data grid size-7 shrink-0 place-items-center rounded-full bg-subtle text-[13px] text-ink">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[13px] text-muted">
                          {f.idea ? <Lightbulb size={14} aria-hidden /> : <Quote size={14} aria-hidden />}
                          <span className="min-w-0 truncate">{f.idea ? f.idea.title : 'Caixa de entrada'}{f.areaName ? ` · ${f.areaName}` : ''}</span>
                          <span className="font-data shrink-0">· {shortDateTime(f.note.createdAt)}</span>
                        </span>
                        <span className="mt-1 block text-[15px] leading-relaxed break-words text-ink">{f.note.text}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : <p className="text-[14px] text-muted">Tente outras palavras, ou solte esse pensamento para guardar.</p>}
          </section>
        </>
      ) : null}
    </form>
  )
}
