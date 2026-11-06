import { isSingleDevice, onSessionChange, readCloudSecret, setupFromCloud, useAuth, writeCloudSecret, authStore } from '../auth/session'
import { validatePassword } from '../auth/vault'
import { applyRemote, purgeUnauthorized } from '../domain/merge'
import type { SyncAdapter } from '../domain/outbox'
import { buildEmpty, uuid } from '../domain/seed'
import type { CollectionName, DataState, PartnerId } from '../domain/types'
import { createStore, useStore } from '../store/createStore'
import { dataStore, enqueueAll } from '../store/data'
import {
  friendlyAuthError,
  fromRow,
  pullRows,
  refresh,
  remoteConfig,
  RemoteError,
  rpc,
  signIn,
  signOut,
  signUp,
  softDelete,
  toRow,
  upsertRow,
  type RemoteSession,
} from './remote'

/**
 * Nuvem entre aparelhos (Supabase).
 * - Conta por pessoa (e-mail + senha). O refresh token fica cifrado no cofre local da pessoa.
 * - Access token só em memória; renovado antes de vencer; revogado ao desconectar.
 * - Bloquear o app esquece o token da memória (a sessão local volta a pedir senha).
 */

export type CloudStatus = 'off' | 'disconnected' | 'connecting' | 'connected' | 'offline'

export interface CloudState {
  configured: boolean
  status: CloudStatus
  email: string | null
  lastPulledAt: string | null
}

const cfg = remoteConfig()
export const cloudStore = createStore<CloudState>({ configured: !!cfg, status: cfg ? 'disconnected' : 'off', email: null, lastPulledAt: null })
export const useCloud = <S>(sel: (s: CloudState) => S) => useStore(cloudStore, sel)

interface CloudSecret {
  refreshToken: string
  email: string
  userId: string
  cursor: string | null
}

let session: RemoteSession | null = null
let secret: CloudSecret | null = null
let trigger: () => void = () => undefined
export const setSyncTrigger = (fn: () => void) => (trigger = fn)

const COLLECTIONS: CollectionName[] = ['couple', 'profiles', 'tasks', 'events', 'meds', 'medLogs', 'transactions', 'helpRequests', 'nudges']

async function persist() {
  if (!secret) return writeCloudSecret(null)
  await writeCloudSecret(JSON.stringify(secret))
}

function adopt(s: RemoteSession, cursor: string | null) {
  session = s
  secret = { refreshToken: s.refreshToken, email: s.email, userId: s.userId, cursor }
  cloudStore.set((c) => ({ ...c, status: 'connected', email: s.email }))
}

let refreshing: Promise<string | null> | null = null

/**
 * Token válido por pelo menos 60 s. Renovação em voo único: com rotação de refresh token,
 * duas renovações simultâneas invalidariam uma à outra e derrubariam a conexão.
 */
async function accessToken(): Promise<string | null> {
  if (!cfg) return null
  if (session && session.expiresAt - Date.now() > 60_000) return session.accessToken
  if (!secret) return null
  refreshing ??= doRefresh(secret).finally(() => (refreshing = null))
  return refreshing
}

async function doRefresh(current: CloudSecret): Promise<string | null> {
  if (!cfg) return null
  try {
    const s = await refresh(cfg, current.refreshToken)
    if (secret !== current) return null // a sessão local foi fechada ou trocada no meio
    adopt(s, current.cursor)
    await persist()
    return s.accessToken
  } catch (e) {
    if (secret !== current) return null
    if (e instanceof RemoteError && e.code === 'network') {
      cloudStore.set((c) => ({ ...c, status: 'offline' }))
      return null
    }
    // refresh revogado ou expirado: precisa entrar de novo
    session = null
    secret = null
    await persist()
    cloudStore.set((c) => ({ ...c, status: 'disconnected', email: null }))
    return null
  }
}

const spaceId = () => dataStore.get().couple.couple?.spaceId ?? null

export const cloudAdapter: SyncAdapter = {
  name: 'Supabase',
  async push(batch) {
    const token = await accessToken()
    const space = spaceId()
    if (!cfg || !token || !space) return []
    const accepted: string[] = []
    for (const e of batch) {
      try {
        if (e.operation === 'DELETE') await softDelete(cfg, token, e.entityType, e.entityId, space)
        else await upsertRow(cfg, token, e.entityType, toRow(e.entityType, e.payload, space))
        accepted.push(e.id)
      } catch (err) {
        if (!(err instanceof RemoteError) || err.code === 'network' || err.status === 401) break
        // 403/409/400: o servidor recusou (ex.: item do par). Não fica preso na fila para sempre.
        accepted.push(e.id)
      }
    }
    return accepted
  },
}

export const isCloudConnected = () => cloudStore.get().status === 'connected' && !!secret

/** Baixa o que mudou desde o último cursor e mescla (última edição vence; dose tomada sempre vence) */
export async function pull(): Promise<number> {
  const token = await accessToken()
  const space = spaceId()
  const from = secret
  if (!cfg || !token || !space || !from) return 0
  // 1) baixa tudo primeiro (pode demorar; o usuário continua usando o app)
  let cursor = from.cursor
  const batches: { c: CollectionName; rows: ReturnType<typeof fromRow>[] }[] = []
  for (const c of COLLECTIONS) {
    const rows = (await pullRows(cfg, token, c, space, from.cursor)).map((r) => fromRow(c, r))
    for (const m of rows) if (!cursor || m.syncedAt > cursor) cursor = m.syncedAt
    if (rows.length) batches.push({ c, rows })
  }
  if (secret !== from) return 0 // sessão fechada ou trocada durante o download
  // 2) aplica de uma vez sobre o estado MAIS RECENTE (evita atualização perdida de quem editou no meio)
  let changed = 0
  const who = authStore.get().who
  const single = isSingleDevice()
  dataStore.set((cur) => {
    let state = cur
    for (const { c, rows } of batches) {
      const r = applyRemote(state, c, rows.map(({ entity, deleted }) => ({ entity: c === 'couple' ? { ...(state.couple.couple ?? {}), ...(entity as object) } : entity, deleted })))
      state = r.state
      changed += r.changed
    }
    return who && single ? purgeUnauthorized(state, who) : state
  })
  if (cursor !== from.cursor) {
    secret = { ...from, ...(secret ?? {}), cursor }
    await persist()
  }
  cloudStore.set((s) => ({ ...s, lastPulledAt: new Date().toISOString() }))
  return changed
}

interface Membership {
  couple_id: string
  partner_id: PartnerId
}

async function membership(token: string): Promise<Membership | null> {
  if (!cfg) return null
  const rows = await rpc<Membership[]>(cfg, token, 'my_membership', {})
  return rows?.[0] ?? null
}

/** Conecta a pessoa que está usando este aparelho (Ajustes > Nuvem) */
export async function connect(mode: 'signup' | 'signin', email: string, password: string): Promise<void> {
  if (!cfg) throw new Error('Nuvem não configurada neste aparelho.')
  const who = authStore.get().who
  const couple = dataStore.get().couple.couple
  if (!who || !couple) throw new Error('Entre no app primeiro.')
  cloudStore.set((c) => ({ ...c, status: 'connecting' }))
  try {
    const s = mode === 'signup' ? await signUp(cfg, email.trim(), password) : await signIn(cfg, email.trim(), password)
    const mine = await membership(s.accessToken)
    let space = couple.spaceId ?? null
    if (mine) {
      if (mine.partner_id !== who || (space && space !== mine.couple_id)) {
        await signOut(cfg, s.accessToken)
        throw new Error('Esta conta pertence a outra pessoa ou a outro espaço.')
      }
      space = mine.couple_id
    } else if (who === 'A' && !space) {
      space = uuid()
      await rpc(cfg, s.accessToken, 'create_couple', { p_couple_id: space, p_split_mode: couple.splitMode, p_ratio_a_bps: couple.ratioABps })
    } else if (space) {
      const joined = await rpc<Membership[]>(cfg, s.accessToken, 'join_couple', { p_code: couple.inviteCode })
      if (joined?.[0]?.partner_id !== who) throw new Error('O convite deste espaço é de outra pessoa.')
    } else {
      throw new Error(`Peça para ${dataStore.get().profiles.A?.displayName ?? 'seu par'} conectar a nuvem primeiro.`)
    }
    if (couple.spaceId !== space) {
      const sp = space
      dataStore.set((st) => ({ ...st, couple: { couple: { ...st.couple.couple!, spaceId: sp, updatedAt: new Date().toISOString() } } }))
    }
    adopt(s, null)
    await persist()
    // o par ainda não entrou na nuvem: registra o convite (só o hash fica no servidor)
    const partner: PartnerId = who === 'A' ? 'B' : 'A'
    if (who === 'A' && authStore.get().people?.[partner].status !== 'absent' && !mine) {
      await rpc(cfg, s.accessToken, 'create_invite', { p_code: couple.inviteCode }).catch(() => undefined)
    }
    enqueueAll(who)
    await pull()
    trigger()
  } catch (e) {
    cloudStore.set((c) => ({ ...c, status: secret ? 'connected' : 'disconnected' }))
    throw e instanceof Error && !(e instanceof RemoteError) ? e : new Error(friendlyAuthError(e))
  }
}

/** Registra de novo o convite na nuvem (após gerar um convite novo) */
export async function publishInvite(code: string) {
  const token = await accessToken()
  if (cfg && token) await rpc(cfg, token, 'create_invite', { p_code: code }).catch(() => undefined)
}

export async function disconnect() {
  if (cfg && session) await signOut(cfg, session.accessToken)
  session = null
  secret = null
  await persist()
  cloudStore.set((c) => ({ ...c, status: 'disconnected', email: null, lastPulledAt: null }))
}

/* ---------- aparelho novo (sem cofre local) ---------- */

async function downloadAll(token: string, space: string): Promise<DataState> {
  if (!cfg) throw new Error('Nuvem não configurada.')
  const base = buildEmpty(new Date())
  let state: DataState = { ...base, outbox: [] }
  let cursor: string | null = null
  for (const c of COLLECTIONS) {
    const rows = (await pullRows(cfg, token, c, space, null)).map((r) => fromRow(c, r))
    for (const m of rows) if (!cursor || m.syncedAt > cursor) cursor = m.syncedAt
    const live = rows.filter((r) => !r.deleted)
    // aparelho vazio: o servidor é a única fonte, as entidades entram como vieram
    const entries = live.map((r) => {
      const e = r.entity as { id: string }
      return [e.id, c === 'couple' ? { ...base.couple.couple, ...e, inviteCode: '' } : e] as const
    })
    state = { ...state, [c]: c === 'couple' || c === 'profiles' ? { ...state[c], ...Object.fromEntries(entries) } : Object.fromEntries(entries) }
  }
  if (!state.profiles.A || !state.profiles.B || !state.couple.couple?.spaceId) {
    throw new Error('O espaço na nuvem ainda não tem os perfis. Peça para quem criou abrir o app conectado.')
  }
  return { ...state, lastSyncedAt: cursor }
}

export interface NewDeviceInput {
  email: string
  password: string
  remember: boolean
  /** convite do par (primeiro acesso dele(a) pela nuvem) */
  inviteCode?: string
  mode: 'signin' | 'signup'
}

/** Entra pela nuvem num aparelho sem dados: cria o cofre local com a mesma senha da conta */
export async function enterFromCloud(input: NewDeviceInput): Promise<void> {
  if (!cfg) throw new Error('Nuvem não configurada neste aparelho.')
  const weak = validatePassword(input.password)
  if (input.mode === 'signup' && weak) throw new Error(weak)
  let s: RemoteSession
  try {
    s = input.mode === 'signup' ? await signUp(cfg, input.email.trim(), input.password) : await signIn(cfg, input.email.trim(), input.password)
  } catch (e) {
    // já tinha conta: entra com ela e segue para o convite
    const exists = e instanceof RemoteError && /already|exists/i.test(`${e.code} ${e.message}`)
    if (!exists) throw new Error(friendlyAuthError(e), { cause: e })
    try {
      s = await signIn(cfg, input.email.trim(), input.password)
    } catch (e2) {
      throw new Error(friendlyAuthError(e2), { cause: e2 })
    }
  }
  let mine = await membership(s.accessToken)
  if (!mine && input.inviteCode) {
    try {
      mine = (await rpc<Membership[]>(cfg, s.accessToken, 'join_couple', { p_code: input.inviteCode }))?.[0] ?? null
    } catch {
      throw new Error('Convite inválido, vencido ou já usado. Peça um novo ao seu par.')
    }
  }
  if (!mine) {
    await signOut(cfg, s.accessToken)
    throw new Error('Esta conta ainda não faz parte de um espaço. Use o convite do seu par.')
  }
  const data = await downloadAll(s.accessToken, mine.couple_id)
  const cursor = data.lastSyncedAt
  session = s
  secret = { refreshToken: s.refreshToken, email: s.email, userId: s.userId, cursor }
  await setupFromCloud({ who: mine.partner_id, password: input.password, data: purgeUnauthorized(data, mine.partner_id), remember: input.remember, cloudSecret: JSON.stringify(secret) })
  cloudStore.set((c) => ({ ...c, status: 'connected', email: s.email, lastPulledAt: new Date().toISOString() }))
}

/* ---------- ciclo de vida ---------- */

let started = false
export function startCloud() {
  if (started || !cfg) return
  started = true
  onSessionChange(() => {
    const unlocked = authStore.get().status === 'unlocked' || authStore.get().status === 'welcome'
    if (!unlocked) {
      session = null
      secret = null
      cloudStore.set((c) => ({ ...c, status: 'disconnected', email: null, lastPulledAt: null }))
      return
    }
    void readCloudSecret().then((raw) => {
      if (!raw || secret) return
      try {
        secret = JSON.parse(raw) as CloudSecret
        cloudStore.set((c) => ({ ...c, status: 'connected', email: secret!.email }))
        trigger()
      } catch {
        secret = null
      }
    })
  })
  setInterval(() => {
    if (document.visibilityState === 'visible' && isCloudConnected()) trigger()
  }, 30_000)
}

export const useCloudPeople = () => useAuth((s) => s.people)
