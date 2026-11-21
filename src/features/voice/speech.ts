/** Voz é opcional. O texto e as regras locais continuam disponíveis sem APIs de fala. */
const speakingListeners = new Set<() => void>()
let activeUtterance: SpeechSynthesisUtterance | null = null
let speaking = false

const synthesis = (): SpeechSynthesis | null => typeof window !== 'undefined' ? window.speechSynthesis ?? null : null

const setSpeaking = (value: boolean) => {
  if (speaking === value) return
  speaking = value
  speakingListeners.forEach((listener) => listener())
}

export const canSpeak = (): boolean => !!synthesis() && typeof SpeechSynthesisUtterance !== 'undefined'
export const isSpeaking = (): boolean => speaking
export const onSpeakingChange = (listener: () => void): (() => void) => {
  speakingListeners.add(listener)
  return () => speakingListeners.delete(listener)
}

export function stopSpeaking(): void {
  activeUtterance = null
  setSpeaking(false)
  try {
    synthesis()?.cancel()
  } catch {
    // Alguns navegadores suspendem a fala ao ir para segundo plano.
  }
}

/** Deve ser chamada diretamente no clique/toque: o iPhone exige speak dentro do gesto, sem await. */
export function speakText(text: string): boolean {
  const engine = synthesis()
  if (!engine || !canSpeak() || !text.trim()) return false
  stopSpeaking()
  try {
    const utterance = new SpeechSynthesisUtterance(text.trim())
    utterance.lang = 'pt-BR'
    utterance.rate = 0.95
    utterance.pitch = 1
    const voice = engine.getVoices().find((candidate) => candidate.lang.toLowerCase() === 'pt-br')
    if (voice) utterance.voice = voice
    const finish = () => {
      if (activeUtterance !== utterance) return
      activeUtterance = null
      setSpeaking(false)
    }
    utterance.onend = finish
    utterance.onerror = finish
    activeUtterance = utterance
    setSpeaking(true)
    if (engine.paused) engine.resume()
    engine.speak(utterance)
    return true
  } catch {
    stopSpeaking()
    return false
  }
}

interface RecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: { transcript: string }
}

interface RecognitionEvent {
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResult }
}

interface BrowserRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionConstructor = new () => BrowserRecognition
type SpeechWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }

const recognitionConstructor = (): RecognitionConstructor | undefined => {
  if (typeof window === 'undefined') return undefined
  const host = window as SpeechWindow
  return host.SpeechRecognition ?? host.webkitSpeechRecognition
}

export const canDictate = (): boolean => !!recognitionConstructor()

export interface DictationSession {
  stop(): void
  abort(): void
}

interface DictationCallbacks {
  onTranscript(text: string): void
  onListeningChange(listening: boolean): void
  onError(message: string): void
}

const dictationError = (error: string): string => {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'O microfone não foi liberado. Você pode digitar ou usar o microfone do teclado.'
  if (error === 'audio-capture') return 'Não encontrei um microfone disponível. Você pode continuar pelo teclado.'
  if (error === 'no-speech') return 'Não ouvi uma frase. Tente de novo ou escreva abaixo.'
  return 'O ditado deste navegador não está disponível agora. Você pode continuar pelo teclado.'
}

/** Instancia a API padrão ou a do Safari apenas após o usuário tocar em Ditar. */
export function startDictation(callbacks: DictationCallbacks): DictationSession | null {
  const Recognition = recognitionConstructor()
  if (!Recognition) return null
  let recognition: BrowserRecognition
  try {
    recognition = new Recognition()
  } catch {
    callbacks.onError(dictationError('unavailable'))
    return null
  }
  let active = true
  let stopping = false
  const release = () => {
    if (!active) return
    active = false
    recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null
    callbacks.onListeningChange(false)
  }
  const abort = () => {
    if (!active) return
    release()
    try {
      recognition.abort()
    } catch {
      // Fechar depois do fim natural não deve falhar nem alterar o texto.
    }
  }
  const stop = () => {
    if (!active || stopping) return
    stopping = true
    callbacks.onListeningChange(false)
    try {
      // stop ainda entrega o resultado final antes de onend. Só abort cancela a transcrição.
      recognition.stop()
    } catch {
      release()
    }
  }
  recognition.lang = 'pt-BR'
  recognition.continuous = false
  recognition.interimResults = true
  recognition.maxAlternatives = 1
  recognition.onstart = () => { if (active && !stopping) callbacks.onListeningChange(true) }
  recognition.onresult = (event) => {
    if (!active) return
    const parts: string[] = []
    for (let index = 0; index < event.results.length; index++) {
      const text = event.results[index]?.[0]?.transcript.trim()
      if (text) parts.push(text)
    }
    if (parts.length) callbacks.onTranscript(parts.join(' '))
  }
  recognition.onerror = (event) => {
    if (!active) return
    if (event.error !== 'aborted') callbacks.onError(dictationError(event.error))
    abort()
  }
  recognition.onend = release
  try {
    callbacks.onListeningChange(true)
    recognition.start()
  } catch {
    release()
    callbacks.onError(dictationError('unavailable'))
    return null
  }
  return { stop, abort }
}
