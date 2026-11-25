import { ArrowRight, Maximize2, MessageSquarePlus, Send, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button, cx, FieldError, Segmented } from '../../components/ui'
import { currentProvider, desktopBridge } from '../../ai/provider'
import { CONVERSATION_LIMITS, type IdeaConversation } from '../../domain/ideas'
import { deleteConversation, extractConversation, myConversations, SendError, sendMessage } from '../../store/conversationActions'
import { useData } from '../../store/data'
import { captureThought } from '../../store/ideaActions'
import { ui, useUi } from '../../store/ui'
import { CaptureBox } from './CaptureBox'
import { afterCapture } from './releaseThought'

type Tab = 'chat' | 'capture' | 'talks'

/**
 * Painel da barra no PC (ADR-0008, ADR-0013): 480 px, uma coisa por vez, o próximo passo em destaque e o resto
 * em "Ver mais". Enter na barra guarda como ideia; Ctrl+Enter abre uma conversa. Letra de 17 px; alvos de 44 px
 * (a pessoa pediu tudo mais enxuto; ver IMPLEMENTATION_PLAN.md).
 */
export function CompactCapture() {
  const viewer = useUi((s) => s.viewer)
  const conversations = useData((s) => s.ideaConversations)
  const mine = useMemo(() => myConversations({ ideaConversations: conversations }, viewer), [conversations, viewer])
  const [tab, setTab] = useState<Tab>('capture')
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const replyRef = useRef<HTMLTextAreaElement>(null)
  const alive = useRef(true)
  // o que chega da barra roda fora do ciclo de renderização: lê sempre o valor atual
  const openIdRef = useRef<string | null>(null)
  openIdRef.current = openId
  const open = openId ? mine.find((c) => c.id === openId) ?? null : null

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const say = async (text: string) => {
    setBusy(true)
    setError(null)
    try {
      const id = await sendMessage(openIdRef.current, text)
      if (alive.current) setOpenId(id)
    } catch (e) {
      if (!alive.current) return
      // a fala foi guardada antes de chamar a IA: mostra a conversa mesmo com erro
      if (e instanceof SendError) setOpenId(e.conversationId)
      setError(e instanceof Error ? e.message : 'A IA não respondeu.')
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const release = (text: string) => {
    const provider = currentProvider()
    const captureId = captureThought(text)
    if (!captureId) return
    setSaved(provider ? 'Guardado. Organizando por trás.' : 'Guardado na Caixa de entrada.')
    afterCapture(captureId, text, provider, {
      onPlace: (place) => { if (alive.current) setSaved(`Guardado. Parece ser de ${place}.`) },
      view: () => desktopBridge()?.openFull?.(),
    })
  }

  // Enter na barra guarda; Ctrl+Enter conversa. Se o cofre estava fechado, o texto esperou no exe até agora.
  useEffect(() => {
    const bridge = desktopBridge()
    if (!bridge) return
    const take = () => {
      void bridge.takeBarSubmit?.().then((p) => {
        if (!p) return
        if (p.mode === 'chat') {
          setTab('chat')
          void say(p.text)
        } else {
          setTab('capture')
          release(p.text)
        }
      })
    }
    take()
    const offSubmit = bridge.onBarSubmit?.(take)
    const offTab = bridge.onPanelTab?.((t) => setTab(t))
    return () => { offSubmit?.(); offTab?.() }
  }, [])

  useEffect(() => {
    if (tab === 'chat') replyRef.current?.focus()
  }, [tab, openId])

  const send = (event?: FormEvent) => {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    void say(text)
  }

  const extract = () => {
    if (!open) return
    try {
      const { captureId, text } = extractConversation(open.id)
      afterCapture(captureId, text, currentProvider(), { view: () => desktopBridge()?.openFull?.() })
      ui.toast('Conversa enviada para as Ideias.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui extrair.')
    }
  }

  const remove = (c: IdeaConversation) => {
    const undo = deleteConversation(c.id)
    if (!undo) return
    if (openId === c.id) setOpenId(null)
    ui.toast('Conversa apagada. As ideias já extraídas ficam.', { undo })
  }

  const last = open?.messages[open.messages.length - 1]
  const earlier = open ? open.messages.slice(0, -1) : []
  const full = !!open && open.messages.length >= CONVERSATION_LIMITS.messages

  return (
    <main
      className="mx-auto flex h-dvh w-full max-w-[480px] flex-col gap-3 p-3"
      data-testid="compact-capture"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role="dialog"]')) desktopBridge()?.hidePanel?.()
      }}
    >
      <div className="flex items-center gap-3">
        <p className="shrink-0 text-[20px] font-extrabold tracking-tight text-ink">
          Ampara<span className="text-action">.</span>
        </p>
        <Segmented<Tab>
          label="O que fazer agora"
          value={tab}
          onChange={setTab}
          size="sm"
          fill
          options={[
            { value: 'capture', label: 'Soltar', testId: 'compact-tab-capture' },
            { value: 'chat', label: 'Conversa', testId: 'compact-tab-chat' },
            { value: 'talks', label: 'Conversas', testId: 'compact-tab-talks' },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'capture' ? (
          <div className="flex flex-col gap-3">
            {saved ? (
              <p role="status" className="flex items-center gap-2 rounded-[16px] border border-line-strong bg-surface p-3 text-[17px] font-semibold text-ink" data-testid="compact-saved">
                <Sparkles size={18} aria-hidden className="shrink-0 text-action" />
                {saved}
              </p>
            ) : null}
            <CaptureBox />
          </div>
        ) : null}

        {tab === 'chat' ? (
          <div className="flex flex-col gap-3" data-testid="compact-chat">
            {last ? (
              <section aria-label={last.role === 'IA' ? 'Resposta do Ampara' : 'O que você disse'} className="module flex flex-col gap-2 p-4" data-testid="compact-last">
                <p className="text-[13px] font-bold text-muted">{last.role === 'IA' ? 'Ampara' : 'Você'}</p>
                <p className="text-[17px] leading-relaxed whitespace-pre-wrap text-ink">{last.text}</p>
              </section>
            ) : (
              <p className="text-[17px] text-ink">Escreva abaixo para conversar. Eu respondo curto.</p>
            )}
            {busy ? <p role="status" className="text-[15px] font-semibold text-muted" data-testid="compact-busy">Pensando…</p> : null}
            {earlier.length ? (
              <details className="rounded-[16px] border border-line bg-surface px-4" data-testid="compact-more">
                <summary className="min-h-11 cursor-pointer py-2.5 text-[15px] font-semibold text-ink">Ver mais ({earlier.length})</summary>
                <ol className="flex flex-col gap-2 pb-3">
                  {earlier.map((m, i) => (
                    <li key={i} className="text-[15px] leading-relaxed text-ink">
                      <span className="font-bold text-muted">{m.role === 'IA' ? 'Ampara: ' : 'Você: '}</span>
                      {m.text}
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
            {error ? <FieldError id="compact-error">{error}</FieldError> : null}
          </div>
        ) : null}

        {tab === 'talks' ? (
          <div className="flex flex-col gap-2" data-testid="compact-talks">
            {mine.length ? mine.map((c) => (
              <div key={c.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => { setOpenId(c.id); setTab('chat'); setError(null) }}
                  className={cx('hoverable flex min-h-12 min-w-0 flex-1 flex-col items-start justify-center rounded-[16px] border bg-surface px-4 py-2 text-left', c.extractedCaptureId ? 'border-solid border-line-strong' : 'border-dashed border-line-strong')}
                  data-testid="compact-talk"
                >
                  <span className="w-full truncate text-[17px] font-semibold text-ink">{c.title}</span>
                  <span className="text-[13px] text-muted">{c.messages.length} falas{c.extractedCaptureId ? ', extraída para as Ideias' : ''}</span>
                </button>
                <button type="button" onClick={() => remove(c)} aria-label={`Apagar a conversa ${c.title}`} className="hoverable grid min-h-11 min-w-11 place-items-center rounded-[14px] text-muted">
                  <Trash2 size={18} aria-hidden />
                </button>
              </div>
            )) : <p className="text-[17px] text-ink" data-testid="compact-no-talks">Nenhuma conversa ainda. Na barra, Ctrl + Enter começa uma.</p>}
          </div>
        ) : null}
      </div>

      {tab === 'chat' ? (
        <form onSubmit={send} className="flex flex-col gap-2" data-testid="compact-reply-form">
          <label htmlFor="compact-reply" className="sr-only">Sua fala</label>
          <textarea
            id="compact-reply"
            ref={replyRef}
            data-testid="compact-reply"
            rows={2}
            maxLength={CONVERSATION_LIMITS.messageMaxChars}
            value={draft}
            disabled={full}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Enter envia. Shift + Enter pula linha."
            className="w-full resize-none rounded-[16px] border border-line-strong bg-bg px-4 py-3 text-[17px] leading-relaxed text-ink placeholder:text-muted"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" icon={Send} busy={busy} disabled={!draft.trim() || full} className="flex-1" data-testid="compact-send">Enviar</Button>
            <Button type="button" variant="secondary" size="sm" icon={Sparkles} disabled={!open} onClick={extract} data-testid="compact-extract">
              {open?.extractedCaptureId ? 'Extrair de novo' : 'Extrair'}
            </Button>
            <Button type="button" variant="quiet" size="sm" icon={MessageSquarePlus} onClick={() => { setOpenId(null); setError(null); replyRef.current?.focus() }} aria-label="Nova conversa" data-testid="compact-new" />
          </div>
        </form>
      ) : null}

      <Button variant="ghost" size="sm" icon={Maximize2} onClick={() => desktopBridge()?.openFull?.()} data-testid="compact-open-full">
        Abrir o Ampara completo <ArrowRight size={16} aria-hidden />
      </Button>
    </main>
  )
}
