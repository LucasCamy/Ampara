import { compactSynced, enqueue, makeEntry } from '../domain/outbox'
import { buildEmpty, buildSeed, uuid, withIdentity } from '../domain/seed'
import type { Collections, CollectionName, DataState, Medication, PartnerId, Transaction } from '../domain/types'
import { createStore, useStore } from './createStore'

/** Chave antiga (dados em texto claro, versão sem login). Migrada para o cofre e apagada no cadastro. */
export const LEGACY_PLAINTEXT_KEY = 'ampara:data:v1'

/**
 * Estado em memória. Antes do login é um marcador vazio (nenhum dado real é lido sem a chave).
 * A gravação cifrada é feita por src/auth/session.ts enquanto a sessão está aberta.
 */
export const dataStore = createStore<DataState>(buildEmpty(new Date()))

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

/** Volta aos dados de exemplo mantendo nomes, convite e o vínculo do casal */
export function resetData() {
  const cur = dataStore.get()
  const A = cur.profiles.A!
  const B = cur.profiles.B!
  const seed = withIdentity(buildSeed(new Date()), {
    a: { name: A.displayName, pronoun: A.pronoun },
    b: { name: B.displayName, pronoun: B.pronoun },
    inviteCode: cur.couple.couple?.inviteCode ?? '',
  })
  dataStore.set(() => seed)
}

/** Coloca todas as entidades na fila (primeira subida ao conectar a nuvem). Não altera nenhum dado. */
/**
 * Só o que esta pessoa pode gravar no servidor (espelho de tx_write e meds_write):
 * lançamentos pessoais e remédios do par sobem pelo aparelho do par.
 */
export function enqueueAll(who: PartnerId) {
  const nowMs = Date.now()
  const mine = (c: CollectionName, e: unknown) => {
    if (c === 'transactions') {
      const t = e as Transaction
      return t.scope === 'COUPLE' || t.createdBy === who
    }
    if (c === 'meds') {
      const m = e as Medication
      return m.ownerId === null || m.ownerId === who
    }
    return true
  }
  dataStore.set((s) => {
    let outbox = s.outbox
    for (const c of ['couple', 'profiles', 'tasks', 'events', 'meds', 'medLogs', 'transactions', 'helpRequests', 'nudges'] as CollectionName[]) {
      for (const [id, entity] of Object.entries(s[c])) {
        if (mine(c, entity)) outbox = enqueue(outbox, makeEntry(c, id, 'UPSERT', entity, nowMs, uuid()))
      }
    }
    return { ...s, outbox }
  })
}
