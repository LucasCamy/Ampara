import type { SyncAdapter } from '../domain/outbox'
import type { CollectionName, OutboxEntry } from '../domain/types'

/** Simula o servidor: aceita todo lote após uma pequena latência. Usado sem credenciais. */
export const loopbackAdapter: SyncAdapter = {
  name: 'Loopback local',
  push: (batch) => new Promise((resolve) => setTimeout(() => resolve(batch.map((e) => e.id)), 450)),
}

const TABLES: Record<CollectionName, string> = {
  couple: 'couples',
  profiles: 'profiles',
  tasks: 'tasks',
  events: 'events',
  meds: 'medications',
  medLogs: 'medication_logs',
  transactions: 'transactions',
  helpRequests: 'help_requests',
  nudges: 'nudges',
}

const snake = (k: string) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
const toRow = (payload: unknown): Record<string, unknown> =>
  Object.fromEntries(Object.entries(payload as Record<string, unknown>).map(([k, v]) => [snake(k), v]))

/**
 * Supabase via PostgREST, sem SDK. Upsert idempotente (merge-duplicates) por id gerado no cliente.
 * Ativado só quando VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY existem.
 */
export function supabaseAdapter(url: string, anonKey: string, getAccessToken: () => string | null, coupleId: () => string): SyncAdapter {
  const headers = () => ({
    apikey: anonKey,
    Authorization: `Bearer ${getAccessToken() ?? anonKey}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  })
  return {
    name: 'Supabase',
    async push(batch: OutboxEntry[]) {
      const accepted: string[] = []
      for (const e of batch) {
        const table = TABLES[e.entityType]
        const res =
          e.operation === 'DELETE'
            ? await fetch(`${url}/rest/v1/${table}?id=eq.${encodeURIComponent(e.entityId)}`, { method: 'DELETE', headers: headers() })
            : await fetch(`${url}/rest/v1/${table}`, { method: 'POST', headers: headers(), body: JSON.stringify(e.entityType === 'couple' ? toRow(e.payload) : { ...toRow(e.payload), couple_id: coupleId() }) })
        if (res.ok) accepted.push(e.id)
      }
      return accepted
    },
  }
}

export function pickAdapter(): SyncAdapter {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (url && key) return supabaseAdapter(url, key, () => null, () => 'couple')
  return loopbackAdapter
}
