import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEntry } from '../domain/outbox'

const { push, pull } = vi.hoisted(() => ({ push: vi.fn(), pull: vi.fn() }))
vi.mock('./cloud', () => ({
  cloudAdapter: { name: 'Nuvem', push },
  isCloudConnected: () => true,
  pull,
  setSyncTrigger: vi.fn(),
  startCloud: vi.fn(),
}))
vi.mock('../store/ui', async () => {
  const { createStore } = await import('../store/createStore')
  return { uiStore: createStore({ forcedOffline: false }) }
})

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('navigator', { onLine: true })
  push.mockReset().mockImplementation(async (batch: { id: string }[]) => batch.map((entry) => entry.id))
  pull.mockReset().mockResolvedValue(0)
})
afterEach(() => vi.unstubAllGlobals())

describe('serialização da mudança de acesso com a sincronização', () => {
  it('espera o lote em curso, pausa os novos envios e retoma depois da conversão', async () => {
    const { dataStore } = await import('../store/data')
    const { syncNow, withSyncPaused } = await import('./engine')
    dataStore.set((cur) => ({ ...cur, outbox: [makeEntry('profiles', 'A', 'UPSERT', cur.profiles.A, 1, 'primeiro')] }))
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    push.mockImplementationOnce(async () => { await gate; return ['primeiro'] })
    const sending = syncNow()
    expect(push).toHaveBeenCalledOnce()
    let entered = false
    const converting = withSyncPaused(async () => {
      entered = true
      expect(pull).toHaveBeenCalledOnce()
      dataStore.set((cur) => ({ ...cur, outbox: [...cur.outbox, makeEntry('profiles', 'B', 'UPSERT', cur.profiles.B, 2, 'depois')] }))
      await syncNow()
      expect(push).toHaveBeenCalledOnce()
    })
    await Promise.resolve()
    expect(entered).toBe(false)
    release()
    await sending
    await converting
    await vi.waitFor(() => expect(dataStore.get().outbox.every((entry) => entry.status === 'SYNCED')).toBe(true))
    expect(push).toHaveBeenCalledTimes(2)
  })

  it('uma falha na conversão também libera a fila pendente', async () => {
    const { dataStore } = await import('../store/data')
    const { syncNow, withSyncPaused } = await import('./engine')
    await expect(withSyncPaused(async () => {
      dataStore.set((cur) => ({ ...cur, outbox: [makeEntry('profiles', 'A', 'UPSERT', cur.profiles.A, 1, 'pendente')] }))
      await syncNow()
      expect(push).not.toHaveBeenCalled()
      throw new Error('RPC indisponível')
    })).rejects.toThrow('RPC indisponível')
    await vi.waitFor(() => expect(dataStore.get().outbox[0]?.status).toBe('SYNCED'))
    expect(push).toHaveBeenCalledOnce()
  })
})
