import type { Couple, DataState } from './types'

/** Modo e dono são autoridade de acesso; uma edição pendente de divisão conserva os demais campos. */
export function applySpaceMode(state: DataState, authority: Pick<Couple, 'mode' | 'soloOwnerId'> & Partial<Pick<Couple, 'inviteCode'>>): DataState {
  const current = state.couple.couple
  if (!current) return state
  const mode = authority.mode ?? 'COUPLE'
  const fields = { mode, soloOwnerId: mode === 'SOLO' ? authority.soloOwnerId ?? 'A' : null, ...(mode === 'SOLO' ? { inviteCode: '' } : typeof authority.inviteCode === 'string' ? { inviteCode: authority.inviteCode } : {}) }
  return {
    ...state,
    couple: { couple: { ...current, ...fields } },
    outbox: state.outbox.map((entry) => entry.entityType === 'couple' && entry.operation === 'UPSERT'
      ? { ...entry, payload: { ...(entry.payload as object), ...fields } }
      : entry),
  }
}
