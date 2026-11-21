import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canDictate, canSpeak, isSpeaking, onSpeakingChange, speakText, startDictation, stopSpeaking } from './speech'

class Utterance {
  lang = ''
  rate = 1
  pitch = 1
  voice: { lang: string } | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public text: string) {}
}

class Recognition {
  static current: Recognition
  lang = ''
  continuous = true
  interimResults = false
  maxAlternatives = 0
  onstart: (() => void) | null = null
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
  constructor() { Recognition.current = this }
}

const unsubscriptions: (() => void)[] = []
const installSynthesis = () => {
  const engine = { speak: vi.fn<(utterance: Utterance) => void>(), cancel: vi.fn(), getVoices: () => [{ lang: 'en-US' }, { lang: 'pt-BR' }], paused: false, resume: vi.fn() }
  vi.stubGlobal('window', { speechSynthesis: engine })
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
  return engine
}
const callbacks = () => ({ onTranscript: vi.fn(), onListeningChange: vi.fn(), onError: vi.fn() })

beforeEach(() => {
  vi.stubGlobal('window', undefined)
  vi.stubGlobal('SpeechSynthesisUtterance', undefined)
})

afterEach(() => {
  unsubscriptions.splice(0).forEach((unsubscribe) => unsubscribe())
  stopSpeaking()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ler em voz alta com gesto do usuário', () => {
  it('permite o app continuar sem APIs de fala, inclusive fora do navegador', () => {
    expect(canSpeak()).toBe(false)
    expect(speakText('Uma coisa por vez.')).toBe(false)
    expect(isSpeaking()).toBe(false)
    expect(() => stopSpeaking()).not.toThrow()
    expect(canDictate()).toBe(false)
    const handlers = callbacks()
    expect(startDictation(handlers)).toBeNull()
    expect(handlers.onError).not.toHaveBeenCalled()
  })

  it('chama speak de forma síncrona em pt-BR e anuncia o fim da fala', () => {
    const engine = installSynthesis()
    const state = vi.fn(() => isSpeaking())
    unsubscriptions.push(onSpeakingChange(state))
    expect(speakText('  Seu dia começa com uma coisa.  ')).toBe(true)
    expect(engine.speak).toHaveBeenCalledTimes(1)
    const utterance = engine.speak.mock.calls[0]![0]
    expect(utterance).toMatchObject({ text: 'Seu dia começa com uma coisa.', lang: 'pt-BR', rate: 0.95, voice: { lang: 'pt-BR' } })
    expect(isSpeaking()).toBe(true)
    expect(state.mock.results.map((result) => result.value)).toEqual([true])
    utterance.onend!()
    expect(state.mock.results.map((result) => result.value)).toEqual([true, false])
  })

  it('a fala anterior não encerra uma leitura nova ao receber um evento atrasado', () => {
    const engine = installSynthesis()
    speakText('Primeiro resumo.')
    const previous = engine.speak.mock.calls[0]![0]
    speakText('Resumo novo.')
    previous.onend!()
    expect(isSpeaking()).toBe(true)
    engine.speak.mock.calls[1]![0].onerror!()
    expect(isSpeaking()).toBe(false)
  })

  it('Parar cancela a leitura e retira o estado ativo imediatamente', () => {
    const engine = installSynthesis()
    engine.paused = true
    speakText('Um pequeno passo.')
    expect(engine.resume).toHaveBeenCalledTimes(1)
    stopSpeaking()
    expect(engine.cancel).toHaveBeenCalledTimes(2)
    expect(isSpeaking()).toBe(false)
  })

  it('falha de áudio ou de criação não derruba o app nem mantém Parar ativo', () => {
    const engine = installSynthesis()
    engine.speak.mockImplementation(() => { throw new Error('Suspenso') })
    expect(speakText('Texto que pode ser lido na tela.')).toBe(false)
    expect(isSpeaking()).toBe(false)
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor() { throw new Error('Indisponível') } })
    expect(speakText('Texto.')).toBe(false)
    expect(isSpeaking()).toBe(false)
  })
})

describe('ditado opcional do navegador', () => {
  it('usa pt-BR e reconstitui a transcrição sem duplicar resultados parciais', () => {
    vi.stubGlobal('window', { SpeechRecognition: Recognition })
    const handlers = callbacks()
    const session = startDictation(handlers)!
    const recognition = Recognition.current
    expect(canDictate()).toBe(true)
    expect(recognition).toMatchObject({ lang: 'pt-BR', continuous: false, interimResults: true, maxAlternatives: 1 })
    expect(recognition.start).toHaveBeenCalledTimes(1)
    recognition.onresult!({ results: [[{ transcript: ' comprar ' }], [{ transcript: '2 kg arroz' }]] })
    recognition.onresult!({ results: [[{ transcript: 'comprar 2 kg arroz' }]] })
    expect(handlers.onTranscript.mock.calls).toEqual([['comprar 2 kg arroz'], ['comprar 2 kg arroz']])
    session.stop()
    expect(recognition.stop).toHaveBeenCalledTimes(1)
    expect(recognition.onresult).not.toBeNull()
    recognition.onresult!({ results: [[{ transcript: 'comprar 2 kg de arroz' }]] })
    expect(handlers.onTranscript).toHaveBeenLastCalledWith('comprar 2 kg de arroz')
    recognition.onend!()
    expect(recognition.onresult).toBeNull()
    expect(handlers.onListeningChange).toHaveBeenLastCalledWith(false)
  })

  it('Parar preserva a frase final mesmo quando nenhum resultado parcial tinha chegado', () => {
    vi.stubGlobal('window', { SpeechRecognition: Recognition })
    const handlers = callbacks()
    const session = startDictation(handlers)!
    const recognition = Recognition.current
    session.stop()
    session.stop()
    expect(recognition.stop).toHaveBeenCalledTimes(1)
    recognition.onresult!({ results: [[{ transcript: 'gastei 35 na farmácia' }]] })
    expect(handlers.onTranscript).toHaveBeenCalledExactlyOnceWith('gastei 35 na farmácia')
    recognition.onend!()
    expect(recognition.onresult).toBeNull()
    expect(handlers.onListeningChange).toHaveBeenLastCalledWith(false)
  })

  it('editar ou fechar após Parar ainda aborta e ignora o resultado final atrasado', () => {
    vi.stubGlobal('window', { SpeechRecognition: Recognition })
    const handlers = callbacks()
    const session = startDictation(handlers)!
    const recognition = Recognition.current
    session.stop()
    const result = recognition.onresult!
    session.abort()
    result({ results: [[{ transcript: 'resultado depois da edição' }]] })
    expect(handlers.onTranscript).not.toHaveBeenCalled()
    expect(recognition.abort).toHaveBeenCalledTimes(1)
    expect(recognition.onresult).toBeNull()
  })

  it('usa webkitSpeechRecognition quando só a API do Safari existe', () => {
    vi.stubGlobal('window', { webkitSpeechRecognition: Recognition })
    const handlers = callbacks()
    const session = startDictation(handlers)
    expect(session).not.toBeNull()
    Recognition.current.onerror!({ error: 'not-allowed' })
    expect(handlers.onError).toHaveBeenCalledWith(expect.stringContaining('microfone do teclado'))
    expect(handlers.onListeningChange).toHaveBeenLastCalledWith(false)
    expect(Recognition.current.abort).toHaveBeenCalledTimes(1)
  })

  it('ao fechar a gaveta, aborta e ignora resultados e erros atrasados', () => {
    vi.stubGlobal('window', { SpeechRecognition: Recognition })
    const handlers = callbacks()
    const session = startDictation(handlers)!
    const recognition = Recognition.current
    const result = recognition.onresult!
    const error = recognition.onerror!
    session.abort()
    handlers.onTranscript.mockClear()
    handlers.onError.mockClear()
    result({ results: [[{ transcript: 'uma frase atrasada' }]] })
    error({ error: 'network' })
    expect(handlers.onTranscript).not.toHaveBeenCalled()
    expect(handlers.onError).not.toHaveBeenCalled()
    expect(recognition.abort).toHaveBeenCalledTimes(1)
    expect(recognition.onstart).toBeNull()
    expect(recognition.onend).toBeNull()
  })

  it('fim natural encerra o indicador sem precisar de um segundo toque', () => {
    vi.stubGlobal('window', { SpeechRecognition: Recognition })
    const handlers = callbacks()
    const session = startDictation(handlers)!
    Recognition.current.onend!()
    expect(handlers.onListeningChange).toHaveBeenLastCalledWith(false)
    session.stop()
    expect(Recognition.current.stop).not.toHaveBeenCalled()
  })

  it('erro ao iniciar deixa o texto editável e devolve uma orientação simples', () => {
    class UnavailableRecognition extends Recognition {
      override start = vi.fn(() => { throw new Error('Microfone indisponível') })
    }
    vi.stubGlobal('window', { SpeechRecognition: UnavailableRecognition })
    const handlers = callbacks()
    expect(startDictation(handlers)).toBeNull()
    expect(handlers.onListeningChange).toHaveBeenLastCalledWith(false)
    expect(handlers.onError).toHaveBeenCalledWith(expect.stringContaining('teclado'))
  })
})
