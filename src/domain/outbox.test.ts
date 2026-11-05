import { describe, expect, it } from 'vitest'
import { compactSynced, enqueue, flushOutbox, makeEntry, pendingEntries, type SyncAdapter } from './outbox'
import type { OutboxEntry } from './types'

let n = 0
const entry = (entityId: string, payload: unknown = {}, ms = 1000) => makeEntry('tasks', entityId, 'UPSERT', payload, ms, `e${++n}`)

const okAdapter: SyncAdapter = { name: 'ok', push: async (b) => b.map((e) => e.id) }
const failAdapter: SyncAdapter = {
  name: 'fail',
  push: async () => {
    throw new Error('rede')
  },
}

describe('sync_outbox', () => {
  it('enfileira mutações como PENDING', () => {
    const q = enqueue([], entry('t1'))
    expect(q).toHaveLength(1)
    expect(q[0]?.status).toBe('PENDING')
  })

  it('compacta mutações pendentes da mesma entidade (só a última sobe)', () => {
    let q: OutboxEntry[] = []
    q = enqueue(q, entry('t1', { title: 'a' }))
    q = enqueue(q, entry('t1', { title: 'b' }))
    q = enqueue(q, entry('t2'))
    expect(q).toHaveLength(2)
    expect(q.find((e) => e.entityId === 't1')?.payload).toEqual({ title: 'b' })
  })

  it('offline: nada sobe e nada se perde', async () => {
    const q = enqueue([], entry('t1'))
    const r = await flushOutbox(q, okAdapter, false)
    expect(r.synced).toBe(0)
    expect(pendingEntries(r.outbox)).toHaveLength(1)
  })

  it('online: sobe e marca SYNCED', async () => {
    const q = enqueue(enqueue([], entry('t1')), entry('t2'))
    const r = await flushOutbox(q, okAdapter, true)
    expect(r.synced).toBe(2)
    expect(pendingEntries(r.outbox)).toHaveLength(0)
  })

  it('falha de rede marca FAILED e tenta de novo depois', async () => {
    const q = enqueue([], entry('t1'))
    const failed = await flushOutbox(q, failAdapter, true)
    expect(failed.outbox[0]?.status).toBe('FAILED')
    expect(failed.outbox[0]?.attempts).toBe(1)
    const retry = await flushOutbox(failed.outbox, okAdapter, true)
    expect(retry.outbox[0]?.status).toBe('SYNCED')
  })

  it('envia em ordem de HLC', async () => {
    const seen: string[] = []
    const spy: SyncAdapter = { name: 'spy', push: async (b) => (seen.push(...b.map((e) => e.entityId)), b.map((e) => e.id)) }
    let q: OutboxEntry[] = []
    q = enqueue(q, entry('late', {}, 3000))
    q = enqueue(q, entry('early', {}, 1000))
    await flushOutbox(q, spy, true)
    expect(seen).toEqual(['early', 'late'])
  })

  it('reenvio é idempotente: entradas já SYNCED não sobem de novo', async () => {
    const q = enqueue([], entry('t1'))
    const first = await flushOutbox(q, okAdapter, true)
    const second = await flushOutbox(first.outbox, okAdapter, true)
    expect(second.synced).toBe(0)
  })

  it('compacta histórico sincronizado antigo', () => {
    const q = Array.from({ length: 80 }, (_, i) => ({ ...entry(`t${i}`), status: 'SYNCED' as const }))
    expect(compactSynced(q, 50)).toHaveLength(50)
  })
})
