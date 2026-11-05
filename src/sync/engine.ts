import { flushOutbox, pendingEntries } from '../domain/outbox'
import { createStore, useStore } from '../store/createStore'
import { dataStore } from '../store/data'
import { uiStore } from '../store/ui'
import { pickAdapter } from './adapters'

export interface SyncState {
  networkOnline: boolean
  syncing: boolean
}

export const syncStore = createStore<SyncState>({
  networkOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
})

export const isOnline = () => syncStore.get().networkOnline && !uiStore.get().forcedOffline

const adapter = pickAdapter()
export const adapterName = adapter.name

let running = false
let again = false

export async function syncNow() {
  if (running) {
    again = true
    return
  }
  if (!isOnline() || pendingEntries(dataStore.get().outbox).length === 0) return
  running = true
  syncStore.set((s) => ({ ...s, syncing: true }))
  try {
    const result = await flushOutbox(dataStore.get().outbox, adapter, isOnline())
    const syncedIds = new Set(result.outbox.filter((e) => e.status === 'SYNCED').map((e) => e.id))
    // mescla: entradas criadas durante o envio continuam pendentes
    dataStore.set((s) => ({
      ...s,
      outbox: s.outbox.map((e) => (syncedIds.has(e.id) ? { ...e, status: 'SYNCED' as const } : e)),
      lastSyncedAt: result.synced > 0 ? new Date().toISOString() : s.lastSyncedAt,
    }))
  } finally {
    running = false
    syncStore.set((s) => ({ ...s, syncing: false }))
    if (again) {
      again = false
      void syncNow()
    }
  }
}

let started = false
export function startSync() {
  if (started) return
  started = true
  window.addEventListener('online', () => {
    syncStore.set((s) => ({ ...s, networkOnline: true }))
    void syncNow()
  })
  window.addEventListener('offline', () => syncStore.set((s) => ({ ...s, networkOnline: false })))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  let prevOutbox = dataStore.get().outbox
  dataStore.subscribe(() => {
    const ob = dataStore.get().outbox
    if (ob !== prevOutbox) {
      prevOutbox = ob
      setTimeout(() => void syncNow(), 250)
    }
  })
  let prevForced = uiStore.get().forcedOffline
  uiStore.subscribe(() => {
    const f = uiStore.get().forcedOffline
    if (f !== prevForced) {
      prevForced = f
      if (!f) void syncNow()
    }
  })
  void syncNow()
}

export const useSync = () => {
  const s = useStore(syncStore, (x) => x)
  const forced = useStore(uiStore, (x) => x.forcedOffline)
  const pending = useStore(dataStore, (d) => pendingEntries(d.outbox).length)
  return { online: s.networkOnline && !forced, syncing: s.syncing, pending, forced }
}
