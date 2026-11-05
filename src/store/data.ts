import { compactSynced, enqueue, makeEntry } from '../domain/outbox'
import { buildSeed, uuid } from '../domain/seed'
import type { Collections, CollectionName, DataState } from '../domain/types'
import { createStore, useStore } from './createStore'

export const STORAGE_KEY = 'ampara:data:v1'

/** Persistência local estruturada (localStorage). Trocável por IndexedDB pela mesma interface. */
export interface Persistence {
  load(): DataState | null
  save(state: DataState): void
  clear(): void
}

export const localPersistence: Persistence = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as DataState
      return parsed.schemaVersion === 1 ? parsed : null
    } catch {
      return null
    }
  },
  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* cota cheia ou modo privado: estado segue em memória */
    }
  },
  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* noop */
    }
  },
}

function initialState(): DataState {
  const loaded = typeof localStorage !== 'undefined' ? localPersistence.load() : null
  if (loaded) return loaded
  const seed = buildSeed(new Date())
  if (typeof localStorage !== 'undefined') localPersistence.save(seed)
  return seed
}

export const dataStore = createStore<DataState>(initialState())
dataStore.subscribe(() => localPersistence.save(dataStore.get()))

export const useData = <S>(sel: (s: DataState) => S) => useStore(dataStore, sel)

type Entity<C extends CollectionName> = Collections[C][string]

export interface Tx {
  get<C extends CollectionName>(c: C, id: string): Entity<C> | undefined
  put<C extends CollectionName>(c: C, entity: Entity<C>): void
  remove<C extends CollectionName>(c: C, id: string): void
  state(): DataState
}

/**
 * Executa uma mutação atômica. Cada entidade tocada:
 *  - é gravada no estado local (latência zero),
 *  - vai para a fila sync_outbox,
 *  - tem a versão anterior guardada para o [Desfazer].
 * Retorna a função de desfazer, que restaura só as entidades tocadas.
 */
export function transact(recipe: (tx: Tx) => void): () => void {
  const before = new Map<string, { c: CollectionName; id: string; prev: unknown }>()
  let draft = dataStore.get()
  const nowMs = Date.now()

  const track = (c: CollectionName, id: string) => {
    const key = `${c}/${id}`
    if (!before.has(key)) before.set(key, { c, id, prev: draft[c][id] })
  }

  const tx: Tx = {
    get: (c, id) => draft[c][id] as never,
    put: (c, entity) => {
      const id = (entity as { id: string }).id
      track(c, id)
      draft = {
        ...draft,
        [c]: { ...draft[c], [id]: entity },
        outbox: enqueue(draft.outbox, makeEntry(c, id, 'UPSERT', entity, nowMs, uuid())),
      }
    },
    remove: (c, id) => {
      if (!(id in draft[c])) return
      track(c, id)
      const next = { ...draft[c] }
      delete next[id]
      draft = { ...draft, [c]: next, outbox: enqueue(draft.outbox, makeEntry(c, id, 'DELETE', null, nowMs, uuid())) }
    },
    state: () => draft,
  }

  recipe(tx)
  draft = { ...draft, outbox: compactSynced(draft.outbox) }
  dataStore.set(() => draft)

  return () =>
    transact((undoTx) => {
      for (const { c, id, prev } of before.values()) {
        if (prev === undefined) undoTx.remove(c, id)
        else undoTx.put(c, prev as never)
      }
    })
}

export function resetData() {
  const seed = buildSeed(new Date())
  dataStore.set(() => seed)
}
