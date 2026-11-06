import type { SyncAdapter } from '../domain/outbox'

/**
 * Sem nuvem conectada: confirma a fila localmente (os dados ficam só neste aparelho, cifrados).
 * Com nuvem conectada, o motor usa `cloudAdapter` (src/sync/cloud.ts).
 */
export const loopbackAdapter: SyncAdapter = {
  name: 'Só neste aparelho',
  push: (batch) => new Promise((resolve) => setTimeout(() => resolve(batch.map((e) => e.id)), 450)),
}
