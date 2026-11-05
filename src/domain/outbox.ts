import type { CollectionName, OutboxEntry, OutboxOperation } from './types'

let counter = 0
let lastMs = 0

/** HLC simplificado: ms epoch com contador para ordenar eventos no mesmo ms */
export function nextHlc(nowMs: number): string {
  if (nowMs === lastMs) counter += 1
  else {
    lastMs = nowMs
    counter = 0
  }
  return `${String(nowMs).padStart(15, '0')}-${String(counter).padStart(4, '0')}`
}

export function makeEntry(
  entityType: CollectionName,
  entityId: string,
  operation: OutboxOperation,
  payload: unknown,
  nowMs: number,
  id: string,
): OutboxEntry {
  return { id, entityType, entityId, operation, payload, hlc: nextHlc(nowMs), status: 'PENDING', attempts: 0 }
}

/**
 * Enfileira uma mutação. Mutações pendentes da mesma entidade são compactadas:
 * só a última versão precisa subir (idempotência por entityType + entityId).
 */
export function enqueue(outbox: OutboxEntry[], entry: OutboxEntry): OutboxEntry[] {
  const withoutStale = outbox.filter(
    (e) => !(e.status === 'PENDING' && e.entityType === entry.entityType && e.entityId === entry.entityId),
  )
  return [...withoutStale, entry]
}

export const pendingEntries = (outbox: OutboxEntry[]) => outbox.filter((e) => e.status !== 'SYNCED')

export interface SyncAdapter {
  readonly name: string
  /** Envia o lote; devolve os ids aceitos pelo servidor (idempotente: reenviar é seguro) */
  push(batch: OutboxEntry[]): Promise<string[]>
}

export interface FlushResult {
  outbox: OutboxEntry[]
  synced: number
  failed: number
}

/** Sobe a fila quando online. Nunca descarta mutação: falha volta como FAILED para nova tentativa. */
export async function flushOutbox(outbox: OutboxEntry[], adapter: SyncAdapter, online: boolean): Promise<FlushResult> {
  const pending = pendingEntries(outbox).sort((a, b) => a.hlc.localeCompare(b.hlc))
  if (!online || pending.length === 0) return { outbox, synced: 0, failed: 0 }
  let accepted: Set<string>
  try {
    accepted = new Set(await adapter.push(pending))
  } catch {
    accepted = new Set()
  }
  let synced = 0
  let failed = 0
  const next = outbox.map((e) => {
    if (e.status === 'SYNCED') return e
    if (accepted.has(e.id)) {
      synced += 1
      return { ...e, status: 'SYNCED' as const }
    }
    failed += 1
    return { ...e, status: 'FAILED' as const, attempts: e.attempts + 1 }
  })
  return { outbox: next, synced, failed }
}

/** Mantém só as últimas N entradas já sincronizadas para não crescer sem limite */
export function compactSynced(outbox: OutboxEntry[], keep = 50): OutboxEntry[] {
  const synced = outbox.filter((e) => e.status === 'SYNCED')
  if (synced.length <= keep) return outbox
  const drop = new Set(synced.slice(0, synced.length - keep).map((e) => e.id))
  return outbox.filter((e) => !drop.has(e.id))
}
