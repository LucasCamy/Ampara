import { Mic, Send, Sparkles, Square } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button, cx, FieldError } from '../../components/ui'
import { IDEA_LIMITS } from '../../domain/ideas'
import { captureThought, scheduleFromProposal } from '../../store/ideaActions'
import { proposeSchedule, useOrganizerWaiting, type ScheduleOffer } from '../../store/ideaAi'
import { parseWhen } from '../../domain/whenParse'
import { toDateKey } from '../../domain/dates'
import { useNow } from '../../store/clock'
import { ui } from '../../store/ui'
import { ScheduleOfferCard } from './ScheduleOfferCard'
import { whenLabel } from './barBridge'
import { afterCapture } from './releaseThought'
import { currentProvider, desktopBridge } from '../../ai/provider'
import { canDictate, startDictation, type DictationSession } from '../voice/speech'

/** Soltar um pensamento: grava na hora, do jeito que veio. Organizar fica para depois. */
export function CaptureBox() {
  const id = useId()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [usedVoice, setUsedVoice] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const waiting = useOrganizerWaiting()
  const today = toDateKey(useNow())
  // marcar pelo campo (ADR-0014): o texto com dia espera o clique em Marcar ou em Só guardar
  const [offer, setOffer] = useState<{ text: string; data: ScheduleOffer | null } | null>(null)
  const offerRef = useRef(offer)
  offerRef.current = offer
  const provider = currentProvider()
  const recognition = useRef<DictationSession | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      recognition.current?.abort()
    }
  }, [])

  const stop = () => {
    recognition.current?.abort()
    recognition.current = null
    setListening(false)
  }

  const dictate = () => {
    // no PC (exe), a voz do Windows escreve direto no campo
    const bridge = desktopBridge()
    if (bridge?.dictate) {
      document.querySelector<HTMLTextAreaElement>(`#${CSS.escape(`${id}-input`)}`)?.focus()
      setUsedVoice(true)
      void bridge.dictate().then((ok) => { if (!ok && mounted.current) setError('Não consegui abrir a voz do Windows. Aperte Win + H.') })
      return
    }
    if (listening) {
      recognition.current?.stop()
      setListening(false)
      return
    }
    stop()
    const prefix = text.trim()
    setError(null)
    recognition.current = startDictation({
      onTranscript: (t) => {
        if (!mounted.current) return
        setText(prefix ? `${prefix} ${t}` : t)
        setUsedVoice(true)
      },
      onListeningChange: (active) => { if (mounted.current) setListening(active) },
      onError: (message) => { if (mounted.current) setError(message) },
    })
  }

  /** Guardar como pensamento (o caminho de sempre). */
  const keep = (thought: string, voice: boolean) => {
    const captureId = captureThought(thought, voice ? 'VOZ' : 'TEXTO')
    if (!captureId) return false
    if (provider) setSaved('Guardado.')
    afterCapture(captureId, thought, provider, {
      onPlace: (place) => { if (mounted.current) setSaved(`Guardado. Parece ser de ${place}.`) },
      restoreText: () => setText((cur) => cur || thought),
      view: () => document.querySelector<HTMLButtonElement>('[data-testid="ideas-view-esboco"]')?.click(),
    })
    return true
  }

  const confirmOffer = () => {
    const o = offerRef.current?.data
    if (!o) return
    const r = scheduleFromProposal(o.proposal)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setOffer(null)
    ui.toast(`${o.proposal.kind === 'EVENT' ? 'Marcado na agenda' : 'Tarefa criada'}: ${o.proposal.title} · ${whenLabel(o)}`, { undo: r.undo })
  }

  const keepOffer = () => {
    const o = offerRef.current
    if (!o) return
    setOffer(null)
    keep(o.text, false)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    stop()
    const thought = text.trim()
    if (thought && parseWhen(thought, today)) {
      // tem um dia: oferece marcar (o código decide dia e hora; a IA só completa com as anotações)
      const mine = { text: thought, data: null as ScheduleOffer | null }
      setOffer(mine)
      setSaved(null)
      setText('')
      setUsedVoice(false)
      void proposeSchedule(thought, today, provider).then((data) => {
        if (!mounted.current || offerRef.current?.text !== thought) return
        if (data) setOffer({ text: thought, data })
        else keepOffer()
      })
      return
    }
    const captureId = captureThought(text, usedVoice ? 'VOZ' : 'TEXTO')
    if (!captureId) {
      setError('Escreva ou dite o que está na sua cabeça.')
      return
    }
    setText('')
    setUsedVoice(false)
    if (provider) setSaved('Guardado.')
    afterCapture(captureId, text, provider, {
      onPlace: (place) => { if (mounted.current) setSaved(`Guardado. Parece ser de ${place}.`) },
      restoreText: () => setText((cur) => cur || text),
      view: () => document.querySelector<HTMLButtonElement>('[data-testid="ideas-view-esboco"]')?.click(),
    })
  }

  return (
    <form onSubmit={submit} noValidate className="module flex flex-col gap-3 p-4 sm:p-5" aria-labelledby={`${id}-label`} data-testid="idea-capture">
      <label id={`${id}-label`} htmlFor={`${id}-input`} className="text-[15px] font-bold text-ink">O que está na sua cabeça?</label>
      <textarea
        id={`${id}-input`}
        data-testid="idea-capture-input"
        rows={3}
        maxLength={IDEA_LIMITS.captureMaxChars}
        value={text}
        onChange={(e) => {
          stop()
          setSaved(null)
          setText(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit()
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        placeholder="Do jeito que vier. Não precisa estar certo."
        className={cx('min-h-24 w-full resize-y rounded-[16px] border bg-bg px-4 py-3 text-[16px] leading-relaxed text-ink placeholder:text-muted', error ? 'border-err' : 'border-line-strong')}
      />
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {provider ? 'Fica guardado na hora. Pode soltar o próximo: a IA organiza por trás, e você pode desfazer. Nada vira tarefa sozinho.' : 'Fica guardado na hora, só para você. Nada vira tarefa sozinho.'}
        </p>
      )}
      {offer ? <ScheduleOfferCard offer={offer.data} onConfirm={confirmOffer} onKeep={keepOffer} /> : null}
      {saved || waiting ? (
        <p role="status" className="flex flex-wrap items-center gap-x-2 text-[14px] font-semibold text-ink" data-testid="idea-organizing">
          <Sparkles size={16} aria-hidden className="text-action" />
          {saved ? <span data-testid="idea-saved">{saved}</span> : null}
          {waiting ? <span className="font-normal text-muted">{waiting === 1 ? '1 organizando por trás' : `${waiting} organizando por trás`}</span> : null}
        </p>
      ) : null}
      <div className="flex gap-2">
        {canDictate() || desktopBridge()?.dictate ? (
          <Button type="button" variant="quiet" icon={listening ? Square : Mic} onClick={dictate} aria-pressed={listening} data-testid="idea-capture-mic" className="shrink-0">
            {listening ? 'Parar' : 'Falar'}
          </Button>
        ) : null}
        <Button type="submit" variant="primary" icon={Send} className="flex-1" data-testid="idea-capture-save">Soltar</Button>
      </div>
    </form>
  )
}
