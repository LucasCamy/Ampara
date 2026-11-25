import { Mic, Send, Sparkles, Square } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button, cx, FieldError } from '../../components/ui'
import { IDEA_LIMITS } from '../../domain/ideas'
import { captureThought } from '../../store/ideaActions'
import { useOrganizerWaiting } from '../../store/ideaAi'
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

  const submit = (event: FormEvent) => {
    event.preventDefault()
    stop()
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
      {saved || waiting ? (
        <p role="status" className="flex flex-wrap items-center gap-x-2 text-[14px] font-semibold text-ink" data-testid="idea-organizing">
          <Sparkles size={16} aria-hidden className="text-action" />
          {saved ? <span data-testid="idea-saved">{saved}</span> : null}
          {waiting ? <span className="font-normal text-muted">{waiting === 1 ? '1 organizando por trás' : `${waiting} organizando por trás`}</span> : null}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        {canDictate() || desktopBridge()?.dictate ? (
          <Button type="button" variant="quiet" icon={listening ? Square : Mic} onClick={dictate} aria-pressed={listening} data-testid="idea-capture-mic" className="sm:w-auto">
            {listening ? 'Parar' : 'Falar'}
          </Button>
        ) : null}
        <Button type="submit" variant="primary" icon={Send} className="flex-1" data-testid="idea-capture-save">Soltar</Button>
      </div>
    </form>
  )
}
