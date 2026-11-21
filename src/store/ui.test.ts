import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let values: Map<string, string>
let html: { dataset: Record<string, string> }

beforeEach(() => {
  vi.resetModules()
  values = new Map()
  html = { dataset: {} }
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
  vi.stubGlobal('document', { documentElement: html, querySelectorAll: () => [] })
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
})

afterEach(() => vi.unstubAllGlobals())

describe('preferências de leitura do aparelho', () => {
  it('usa a leitura padrão sem preferências e aplica os atributos antes da tela', async () => {
    const { applyReading, uiStore } = await import('./ui')
    const state = uiStore.get()
    expect(state).toMatchObject({ readingFont: 'jakarta', readingComfort: 'default' })
    applyReading(state.readingFont, state.readingComfort)
    expect(html.dataset).toEqual({ font: 'jakarta', reading: 'default' })
  })

  it.each(['lexend', 'atkinson'] as const)('recupera %s e leitura ampla ao abrir o app outra vez', async (font) => {
    const first = await import('./ui')
    first.ui.setReadingFont(font)
    first.ui.setReadingComfort('wide')
    expect(html.dataset).toMatchObject({ font, reading: 'wide' })
    expect(JSON.parse(values.get('ampara:prefs')!)).toMatchObject({ readingFont: font, readingComfort: 'wide' })

    vi.resetModules()
    const next = await import('./ui')
    expect(next.uiStore.get()).toMatchObject({ readingFont: font, readingComfort: 'wide' })
    next.applyReading(next.uiStore.get().readingFont, next.uiStore.get().readingComfort)
    expect(html.dataset).toMatchObject({ font, reading: 'wide' })
  })

  it('volta ao espaçamento padrão sem mudar a fonte ou o tema escolhido', async () => {
    values.set('ampara:prefs', JSON.stringify({ theme: 'dark', readingFont: 'atkinson', readingComfort: 'wide' }))
    const { ui, uiStore } = await import('./ui')
    ui.setReadingComfort('default')
    expect(uiStore.get()).toMatchObject({ theme: 'dark', readingFont: 'atkinson', readingComfort: 'default' })
    expect(html.dataset).toMatchObject({ font: 'atkinson', reading: 'default' })
  })

  it('não deixa preferências de leitura escolherem a pessoa nem guardar dados da sessão', async () => {
    values.set('ampara:prefs', JSON.stringify({ viewer: 'B', tab: 'financas', sheet: { kind: 'expense' }, readingFont: 'lexend', readingComfort: 'wide' }))
    const { ui, uiStore } = await import('./ui')
    expect(uiStore.get()).toMatchObject({ viewer: 'A', sheet: null, readingFont: 'lexend', readingComfort: 'wide' })
    ui.setTheme('dark')
    expect(JSON.parse(values.get('ampara:prefs')!)).toEqual({ theme: 'dark', forcedOffline: false, readingFont: 'lexend', readingComfort: 'wide' })
  })

  it.each(['null', '[]', '"texto"', '{quebrado', '{"readingFont":"inexistente","readingComfort":"large"}'])('preferência inválida %s não impede o acesso', async (raw) => {
    values.set('ampara:prefs', raw)
    const { uiStore } = await import('./ui')
    expect(uiStore.get()).toMatchObject({ readingFont: 'jakarta', readingComfort: 'default' })
  })

  it('continua aplicando leitura nesta sessão se o armazenamento do navegador bloquear', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('indisponível') },
      setItem: () => { throw new Error('indisponível') },
    })
    const { ui } = await import('./ui')
    expect(() => { ui.setReadingFont('lexend'); ui.setReadingComfort('wide') }).not.toThrow()
    expect(html.dataset).toMatchObject({ font: 'lexend', reading: 'wide' })
  })
})
