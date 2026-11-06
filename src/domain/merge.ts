import { canViewCycleLog } from './cycle'
import type { CalendarEvent, CollectionName, CycleLog, CycleSettings, DataState, Medication, MedicationLog, PartnerId, Task, Transaction } from './types'

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

/** Ids que o servidor ainda mostra para quem está usando (consulta só de ids, sem cursor) */
export type VisibleIds = Partial<Record<'tasks' | 'events' | 'meds' | 'cycleSettings' | 'cycleLogs', ReadonlySet<string>>>

export interface PurgeOptions {
  /** ids visíveis no servidor agora; sem isso, só as regras locais valem */
  visible?: VisibleIds
  /** itens com mudança local ainda não confirmada pelo servidor (outbox): nunca saem */
  protect?: ReadonlySet<string>
  /** quando a lista de ids foi pedida: o que mudou depois disso ainda pode não estar nela */
  since?: string
}

/**
 * Autorização vencida (classe "stale authorization" da skill de segurança), num aparelho de uma pessoa só.
 * O servidor deixa de mandar o que o par tornou privado, mas a cópia antiga continua aqui dizendo que era
 * compartilhada. Por isso, além das regras locais (espelho do RLS), vale a lista de ids que o servidor
 * ainda mostra:
 * - lançamentos: aba pessoal do par fechada ou presente secreto;
 * - tarefas: privada do par ou sumida do servidor;
 * - compromissos: "Meu · só você vê" do par ou sumido do servidor;
 * - remédios: do par sem rede de apoio ou sumido do servidor; as doses dele saem junto;
 * - ciclo: ajustes do par com "Só eu vejo" e registros do par sem "Tudo" (ou sumidos do servidor);
 * - fila: mudanças pendentes de itens que saíram (o servidor recusaria para sempre).
 * O que é meu nunca sai.
 */
export function purgeUnauthorized(state: DataState, owner: PartnerId, opts: PurgeOptions = {}): DataState {
  const partner: PartnerId = owner === 'A' ? 'B' : 'A'
  const { visible = {}, protect, since } = opts
  const onServer = (c: keyof VisibleIds, e: { id: string; updatedAt: string }) => {
    const ids = visible[c]
    if (!ids || ids.has(e.id)) return true
    // ainda subindo, ou mudou depois que a lista foi pedida: na dúvida, fica
    return !!protect?.has(e.id) || (!!since && e.updatedAt >= since)
  }

  const partnerShares = state.profiles[partner]?.sharePersonalFinances ?? false
  const keepTx = (t: Transaction) => t.scope === 'COUPLE' || t.createdBy === owner || (partnerShares && !t.isSecretGift)
  const keepTask = (t: Task) =>
    t.assignedTo === owner || t.sentBy === owner || ((t.assignedTo === null || t.visibleToPartner) && onServer('tasks', t))
  const keepEvent = (e: CalendarEvent) => e.ownerId === owner || (e.ownerId === null && onServer('events', e))
  const keepMed = (m: Medication) =>
    m.ownerId === owner || ((m.ownerId === null || m.notifyPartnerOnDelay) && onServer('meds', m))
  const partnerCycle = state.cycleSettings[partner]
  // a linha de ajustes do par é sempre legível (diz NONE quando fechou); a tela filtra por canViewCycleSettings
  const keepCycleSettings = (s: CycleSettings) => s.id === owner || onServer('cycleSettings', s)
  const keepCycleLog = (l: CycleLog) =>
    l.ownerId === owner || (canViewCycleLog(l, owner, partnerCycle) && onServer('cycleLogs', l))

  const removed = new Set<string>()
  const filter = <T extends { id: string }>(map: Record<string, T>, keep: (x: T) => boolean): Record<string, T> => {
    const all = Object.values(map)
    if (all.every(keep)) return map
    for (const x of all) if (!keep(x)) removed.add(x.id)
    return Object.fromEntries(all.filter(keep).map((x) => [x.id, x]))
  }

  const transactions = filter(state.transactions, keepTx)
  const tasks = filter(state.tasks, keepTask)
  const events = filter(state.events, keepEvent)
  const meds = filter(state.meds, keepMed)
  const medLogs = meds === state.meds ? state.medLogs : filter(state.medLogs, (l) => !removed.has(l.medicationId))
  const cycleLogs = filter(state.cycleLogs, keepCycleLog)
  // ideia de presente do par nunca fica neste aparelho (é surpresa para quem está aqui)
  const giftIdeas = filter(state.giftIdeas, (g) => g.ownerId === owner)
  // ajustes têm id = pessoa ('A'/'B'), igual ao do perfil: não entram em `removed` (que limpa a fila por id)
  const cycleSettings = Object.values(state.cycleSettings).every(keepCycleSettings)
    ? state.cycleSettings
    : Object.fromEntries(Object.values(state.cycleSettings).filter(keepCycleSettings).map((s) => [s.id, s]))
  if (!removed.size && cycleSettings === state.cycleSettings) return state
  const logIds = Object.keys(state.medLogs).filter((id) => !medLogs[id])
  for (const id of logIds) removed.add(id)
  const outbox = state.outbox.filter((e) => !removed.has(e.entityId))
  return { ...state, transactions, tasks, events, meds, medLogs, cycleLogs, cycleSettings, giftIdeas, outbox }
}
