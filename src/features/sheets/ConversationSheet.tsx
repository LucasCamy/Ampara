import { ListOrdered, MessageSquarePlus, Send, Sparkles } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button, cx, FieldError } from '../../components/ui'
import { currentProvider } from '../../ai/provider'
import { CONVERSATION_LIMITS } from '../../domain/ideas'
import { extractConversation, myConversations, SendError, sendMessage } from '../../store/conversationActions'
import { useData } from '../../store/data'
import { describeAiResult, queueOrganize } from '../../store/ideaAi'
import { ui, useUi } from '../../store/ui'
import { shortDateTime } from '../ideas/ideaUi'

/**
 * Conversa com a IA no app (celular e web), como na barra do PC (ADR-0013): um campo só, a última resposta em
 * destaque e o resto em "Ver mais". Extrair leva a conversa para as Ideias, e o organizador decide o resto.
 */
export function ConversationSheet({ startId }: { startId?: string }) {
  const id = useId()
  const viewer = useUi((s) => s.viewer)
  const all = useData((s) => s.ideaConversations)
  const mine = useMemo(() => myConversations({ ideaConversations: all }, viewer), [all, viewer])
  const [openId, setOpenId] = useState<string | null>(startId ?? null)
  const [listing, setListing] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const open = openId ? mine.find((c) => c.id === openId) ?? null : null
  const msgs = open?.messages ?? []
  const lastIa = [...msgs].reverse().find((m) => m.role === 'IA')
  const lastIdx = lastIa ? msgs.lastIndexOf(lastIa) : -1
  // a pergunta que gerou a última resposta fica junto dela; o resto vai para "Ver mais"
  const asked = lastIdx > 0 && msgs[lastIdx - 1]?.role === 'PESSOA' ? lastIdx - 1 : lastIdx
  const after = msgs.slice(lastIdx + 1)
  const earlier = asked > 0 ? msgs.slice(0, asked) : []
  const full = msgs.length >= CONVERSATION_LIMITS.messages

  const focusField = () => window.setTimeout(() => input.current?.focus(), 30)

  const send = (event?: FormEvent) => {
    event?.preventDefault()
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    setError(null)
    setNote(null)
    setText('')
    sendMessage(openId, t)
      .then((cid) => { if (alive.current) setOpenId(cid) })
      .catch((e: unknown) => {
        if (!alive.current) return
        if (e instanceof SendError) setOpenId(e.conversationId)
        setError(e instanceof Error ? e.message : 'A IA não respondeu.')
      })
      .finally(() => { if (alive.current) { setBusy(false); focusField() } })
  }

  const extract = () => {
    if (!open) return
    try {
      const { captureId } = extractConversation(open.id)
      setNote('Enviada para as Ideias. A IA organiza por trás.')
      const provider = currentProvider()
      if (provider) {
        void queueOrganize(captureId, provider)
          .then((r) => ui.toast(describeAiResult(r)))
          .catch(() => undefined)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui extrair.')
    }
  }

  if (listing) {
    return (
      <div className="flex flex-col gap-3 pt-2" data-testid="conv-list">
        {mine.length ? (
          <ul className="flex flex-col gap-2">
            {mine.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => { setOpenId(c.id); setListing(false); setError(null); setNote(null); focusField() }}
                  className="press hoverable flex min-h-12 w-full items-center justify-between gap-3 rounded-[14px] border border-line px-3 py-2 text-left"
                  data-testid="conv-item"
                >
                  <span className="min-w-0 text-[15px] font-semibold break-words text-ink">{c.title || 'Conversa'}</span>
                  <span className="shrink-0 font-data text-[12px] text-muted">{shortDateTime(c.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-[15px] text-muted">Nenhuma conversa ainda.</p>}
        <Button variant="secondary" icon={MessageSquarePlus} onClick={() => { setOpenId(null); setListing(false); focusField() }} data-testid="conv-new">Nova conversa</Button>
      </div>
    )
  }

  return (
    <form onSubmit={send} noValidate className="flex flex-col gap-3 pt-2" data-testid="conv-form">
      {after.filter((m) => m.role === 'PESSOA').map((m, i) => (
        <p key={i} className="text-[15px] break-words whitespace-pre-wrap text-muted" data-testid="conv-mine">{m.text}</p>
      ))}
      {!busy && lastIa && asked < lastIdx ? <p className="text-[15px] break-words whitespace-pre-wrap text-muted" data-testid="conv-asked">{msgs[asked]!.text}</p> : null}
      {busy ? <p role="status" className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Sparkles size={16} aria-hidden className="text-action" />Pensando…</p> : null}
      {!busy && lastIa ? (
        <section className="rounded-[16px] border border-line bg-surface p-3" aria-labelledby={`${id}-answer`} data-testid="conv-answer">
          <h3 id={`${id}-answer`} className="text-[13px] font-bold text-muted">Ampara</h3>
          <p className="mt-1 text-[16px] leading-relaxed break-words whitespace-pre-wrap text-ink">{lastIa.text}</p>
        </section>
      ) : null}
      {earlier.length ? (
        <details className="rounded-[14px] border border-line px-3 py-2" data-testid="conv-more">
          <summary className="min-h-10 cursor-pointer content-center text-[14px] font-bold text-muted">Ver mais ({earlier.length})</summary>
          <ol className="flex flex-col gap-2 pt-2">
            {earlier.map((m, i) => (
              <li key={i} className="text-[15px] break-words whitespace-pre-wrap text-ink">
                <span className="block text-[12px] font-bold text-muted">{m.role === 'IA' ? 'Ampara' : 'Você'}</span>{m.text}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {note ? <p className="text-[14px] text-muted" role="status">{note}</p> : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}

      <label htmlFor={`${id}-input`} className="sr-only">{open ? 'Continue a conversa' : 'Pergunte ou pense em voz alta'}</label>
      <textarea
        id={`${id}-input`}
        ref={input}
        rows={2}
        maxLength={CONVERSATION_LIMITS.messageMaxChars}
        value={text}
        disabled={full}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }}
        placeholder={full ? 'Conversa longa: extraia o que importa e comece outra.' : open ? 'Continue a conversa…' : 'Pergunte ou pense em voz alta…'}
        className={cx('min-h-14 w-full resize-y rounded-[16px] border bg-bg px-4 py-3 text-[16px] leading-relaxed text-ink placeholder:text-muted', error ? 'border-err' : 'border-line-strong')}
        data-testid="conv-input"
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" icon={Send} busy={busy} disabled={!text.trim() || full} className="flex-1" data-testid="conv-send">Enviar</Button>
        {open ? (
          <Button variant="secondary" icon={Sparkles} onClick={extract} disabled={busy || !!open.extractedCaptureId || !!note} data-testid="conv-extract">
            {open.extractedCaptureId ? 'Extraída' : 'Extrair'}
          </Button>
        ) : null}
        <Button variant="quiet" icon={ListOrdered} onClick={() => setListing(true)} data-testid="conv-open-list">Conversas</Button>
        {open ? <Button variant="quiet" icon={MessageSquarePlus} onClick={() => { setOpenId(null); setError(null); setNote(null); focusField() }} data-testid="conv-new">Nova</Button> : null}
      </div>
    </form>
  )
}
