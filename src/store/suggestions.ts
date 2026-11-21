import { useEffect } from 'react'
import { readLocalMetadata, writeLocalMetadata } from '../auth/storage'
import { SUGGESTION_COOLDOWN_MS } from '../domain/suggestions'
import type { DataState, PartnerId } from '../domain/types'
import { createStore, useStore } from './createStore'

/** Só ids opacos e instantes de dispensa. Conteúdo de tarefa, saúde e finanças fica no cofre. */
export const suggestionCooldownsStore = createStore<Record<string, Record<string, number>>>({})
const loads = new Map<string, Promise<void>>()
const writes = new Map<string, Promise<void>>()
const EMPTY: Readonly<Record<string, number>> = {}

export const suggestionScope = (state: DataState) => state.couple.couple?.pairedAt ?? 'local'
export const suggestionCooldownKey = (scope: string, viewer: PartnerId) => `suggestion-cooldowns:${scope}:${viewer}`
const validId = (id: string) => id.length <= 200 && /^(postponed-task|recurring-expense|event-preparation|comfort-kit|discovery):/.test(id)

function normalizeCooldowns(raw: unknown, now: number): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).filter(([id, time]) => validId(id) && typeof time === 'number' && Number.isFinite(time) && time >= 0 && time <= now + 60_000 && now - time < SUGGESTION_COOLDOWN_MS))
}

const merge = (saved: Record<string, number>, current: Record<string, number> = {}) => Object.fromEntries([...new Set([...Object.keys(saved), ...Object.keys(current)])].map((id) => [id, Math.max(saved[id] ?? 0, current[id] ?? 0)]))

export async function loadSuggestionDismissals(scope: string, viewer: PartnerId, now = Date.now()): Promise<void> {
  const key = suggestionCooldownKey(scope, viewer)
  if (suggestionCooldownsStore.get()[key]) return
  const pending = loads.get(key)
  if (pending) return pending
  const request = (async () => {
    const saved = normalizeCooldowns(await readLocalMetadata(key), now)
    suggestionCooldownsStore.set((current) => ({ ...current, [key]: merge(saved, current[key]) }))
  })().finally(() => loads.delete(key))
  loads.set(key, request)
  return request
}

/** Dispensa imediatamente; gravações do mesmo espaço são serializadas para preservar dispensa concorrente. */
export function dismissSuggestion(scope: string, viewer: PartnerId, id: string, now = Date.now()): Promise<void> {
  if (!validId(id) || !Number.isFinite(now) || now < 0) return Promise.resolve()
  const key = suggestionCooldownKey(scope, viewer)
  suggestionCooldownsStore.set((current) => ({ ...current, [key]: { ...current[key], [id]: now } }))
  const pending = (writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const saved = normalizeCooldowns(await readLocalMetadata(key), now)
    const value = normalizeCooldowns(merge(saved, suggestionCooldownsStore.get()[key]), now)
    await writeLocalMetadata(key, value)
  })
  writes.set(key, pending)
  void pending.finally(() => { if (writes.get(key) === pending) writes.delete(key) }).catch(() => undefined)
  return pending
}

export function useSuggestionDismissals(scope: string, viewer: PartnerId) {
  const key = suggestionCooldownKey(scope, viewer)
  const dismissals = useStore(suggestionCooldownsStore, (state) => state[key])
  useEffect(() => {
    void loadSuggestionDismissals(scope, viewer).catch(() => {
      suggestionCooldownsStore.set((current) => current[key] ? current : { ...current, [key]: {} })
    })
  }, [scope, viewer, key])
  return { ready: dismissals !== undefined, dismissals: dismissals ?? EMPTY }
}
