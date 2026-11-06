import type { CollectionName, DataState, MedicationLog, PartnerId, Transaction } from './types'

export interface RemoteRow<T = unknown> {
  entity: T
  deleted: boolean
}

const updatedAtOf = (x: unknown) => (x as { updatedAt?: string } | undefined)?.updatedAt ?? ''

/**
 * Decide qual versão fica quando o mesmo item mudou nos dois aparelhos.
 * - Dose de remédio: "tomado" sempre vence (idempotente: nunca desconta estoque duas vezes, nunca "destoma").
 * - Demais: a última edição vence (LWW por updatedAt). Empate mantém a versão local.
 */
export function pickWinner(collection: CollectionName, local: unknown, remote: unknown): 'local' | 'remote' {
  if (local === undefined) return 'remote'
  if (collection === 'medLogs') {
    const l = local as MedicationLog
    const r = remote as MedicationLog
    if (l.status === 'TAKEN' && r.status !== 'TAKEN') return 'local'
    if (r.status === 'TAKEN' && l.status !== 'TAKEN') return 'remote'
  }
  return updatedAtOf(remote) > updatedAtOf(local) ? 'remote' : 'local'
}

/** Aplica linhas vindas do servidor. Exclusão lógica remove o item se ninguém o editou depois. */
export function applyRemote(state: DataState, collection: CollectionName, rows: RemoteRow[]): { state: DataState; changed: number } {
  let changed = 0
  const next = { ...state[collection] } as Record<string, unknown>
  for (const row of rows) {
    const id = (row.entity as { id: string }).id
    const local = next[id]
    if (row.deleted) {
      if (local !== undefined && updatedAtOf(row.entity) >= updatedAtOf(local)) {
        delete next[id]
        changed += 1
      }
      continue
    }
    if (pickWinner(collection, local, row.entity) === 'remote' && JSON.stringify(local) !== JSON.stringify(row.entity)) {
      next[id] = row.entity
      changed += 1
    }
  }
  return changed ? { state: { ...state, [collection]: next }, changed } : { state, changed }
}

/**
 * Autorização vencida (classe "stale authorization" da skill de segurança):
 * num aparelho de uma pessoa só, se o par fechou a aba pessoal, cópias antigas
 * dos lançamentos pessoais dele(a) saem deste aparelho. Presentes nunca deveriam estar aqui.
 */
export function purgeUnauthorized(state: DataState, owner: PartnerId): DataState {
  const partner: PartnerId = owner === 'A' ? 'B' : 'A'
  const partnerShares = state.profiles[partner]?.sharePersonalFinances ?? false
  const keep = (t: Transaction) => t.scope === 'COUPLE' || t.createdBy === owner || (partnerShares && !t.isSecretGift)
  const all = Object.values(state.transactions)
  if (all.every(keep)) return state
  return { ...state, transactions: Object.fromEntries(all.filter(keep).map((t) => [t.id, t])) }
}
