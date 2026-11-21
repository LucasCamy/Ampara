import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SUGGESTION_COOLDOWN_MS } from '../domain/suggestions'

const saved = new Map<string, unknown>()
const read = vi.fn(async (key: string) => saved.get(key))
const write = vi.fn(async (key: string, value: unknown) => { saved.set(key, value) })
vi.mock('../auth/storage', () => ({ readLocalMetadata: (key: string) => read(key), writeLocalMetadata: (key: string, value: unknown) => write(key, value) }))

const { dismissSuggestion, loadSuggestionDismissals, suggestionCooldownKey, suggestionCooldownsStore } = await import('./suggestions')
const now = new Date('2026-11-21T12:00:00Z').getTime()

beforeEach(() => {
  saved.clear()
  read.mockReset().mockImplementation(async (key) => saved.get(key))
  write.mockReset().mockImplementation(async (key, value) => { saved.set(key, value) })
  suggestionCooldownsStore.set(() => ({}))
})

describe('cooldown local das sugestões', () => {
  it('persiste só id e instante e recupera ao reabrir o espaço', async () => {
    await dismissSuggestion('space', 'A', 'discovery:reading', now)
    const key = suggestionCooldownKey('space', 'A')
    expect(saved.get(key)).toEqual({ 'discovery:reading': now })
    suggestionCooldownsStore.set(() => ({}))
    await loadSuggestionDismissals('space', 'A', now)
    expect(suggestionCooldownsStore.get()[key]).toEqual({ 'discovery:reading': now })
  })

  it('a promessa só termina depois de confirmar a escrita no armazenamento', async () => {
    let release: () => void = () => undefined
    write.mockImplementationOnce(async (key, value) => {
      await new Promise<void>((resolve) => { release = resolve })
      saved.set(key, value)
    })
    let finished = false
    const pending = dismissSuggestion('space', 'A', 'discovery:voice', now).then(() => { finished = true })
    await vi.waitFor(() => expect(write).toHaveBeenCalled())
    expect(finished).toBe(false)
    release()
    await pending
    expect(finished).toBe(true)
  })

  it('separa aparelhos lógicos por espaço e pessoa, sem perder dispensas concorrentes', async () => {
    await Promise.all([
      dismissSuggestion('space', 'A', 'discovery:reading', now),
      dismissSuggestion('space', 'A', 'discovery:voice', now + 1),
      dismissSuggestion('space', 'B', 'discovery:routines', now),
      dismissSuggestion('other', 'A', 'discovery:voice', now),
    ])
    expect(saved.get(suggestionCooldownKey('space', 'A'))).toEqual({ 'discovery:reading': now, 'discovery:voice': now + 1 })
    expect(saved.get(suggestionCooldownKey('space', 'B'))).toEqual({ 'discovery:routines': now })
    expect(saved.get(suggestionCooldownKey('other', 'A'))).toEqual({ 'discovery:voice': now })
  })

  it('carregamento iniciado antes da dispensa não sobrescreve o instante novo', async () => {
    let release: (value: unknown) => void = () => undefined
    read.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const loading = loadSuggestionDismissals('space', 'A', now)
    await dismissSuggestion('space', 'A', 'discovery:reading', now)
    release({ 'discovery:reading': now - 1000 })
    await loading
    expect(suggestionCooldownsStore.get()[suggestionCooldownKey('space', 'A')]?.['discovery:reading']).toBe(now)
  })

  it('descarta marcadores expirados, corrompidos ou que não são ids de sugestão', async () => {
    const key = suggestionCooldownKey('space', 'A')
    saved.set(key, { 'discovery:reading': now - SUGGESTION_COOLDOWN_MS, 'discovery:voice': 'ontem', 'discovery:routines': now + 86_400_000, description: 'Dado que não pertence aqui', 'postponed-task:opaque-id': now - 1000 })
    await loadSuggestionDismissals('space', 'A', now)
    expect(suggestionCooldownsStore.get()[key]).toEqual({ 'postponed-task:opaque-id': now - 1000 })
  })
})
