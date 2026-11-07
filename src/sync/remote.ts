import type { CollectionName } from '../domain/types'

/**
 * Cliente mínimo do Supabase via HTTP (GoTrue + PostgREST), sem SDK.
 * Tokens só no cabeçalho Authorization (sem cookie: sem CSRF). Nunca grava com a chave anônima.
 */

export interface RemoteConfig {
  url: string
  anonKey: string
}

export function remoteConfig(): RemoteConfig | null {
  const raw = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '')
  const url = raw === 'self' && typeof location !== 'undefined' ? location.origin : raw
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  return url && anonKey ? { url, anonKey } : null
}

export interface RemoteSession {
  accessToken: string
  refreshToken: string
  /** epoch ms */
  expiresAt: number
  userId: string
  email: string
}

export class RemoteError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

const TIMEOUT_MS = 15_000

async function call(cfg: RemoteConfig, path: string, init: RequestInit & { token?: string }): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${cfg.url}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        apikey: cfg.anonKey,
        'Content-Type': 'application/json',
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.headers ?? {}),
      },
    })
    const text = await res.text()
    const body = text ? (JSON.parse(text) as Record<string, unknown>) : null
    if (!res.ok) {
      const msg = String(body?.msg ?? body?.message ?? body?.error_description ?? body?.error ?? res.statusText)
      throw new RemoteError(res.status, String(body?.error_code ?? body?.code ?? res.status), msg)
    }
    return body
  } catch (e) {
    if (e instanceof RemoteError) throw e
    throw new RemoteError(0, 'network', 'Sem conexão com o servidor.')
  } finally {
    clearTimeout(timer)
  }
}

interface GoTrueSession {
  access_token: string
  refresh_token: string
  expires_in: number
  user: { id: string; email: string }
}

const toSession = (s: GoTrueSession): RemoteSession => ({
  accessToken: s.access_token,
  refreshToken: s.refresh_token,
  expiresAt: Date.now() + s.expires_in * 1000,
  userId: s.user.id,
  email: s.user.email,
})

/** Mensagens de erro em português, sem revelar se o e-mail existe */
export function friendlyAuthError(e: unknown): string {
  if (!(e instanceof RemoteError)) return 'Não foi possível falar com o servidor.'
  if (e.code === 'network') return 'Sem conexão. Tente de novo quando a internet voltar.'
  if (e.status === 400 && /invalid/i.test(e.message)) return 'E-mail ou senha incorretos.'
  if (/already registered|already exists|user_already_exists/i.test(`${e.code} ${e.message}`)) return 'Este e-mail já tem conta. Use "Já tenho conta".'
  if (e.status === 429) return 'Muitas tentativas. Aguarde um pouco.'
  if (/password/i.test(e.message)) return 'A senha não atende às regras do servidor.'
  return e.message || 'Não foi possível concluir.'
}

export async function signUp(cfg: RemoteConfig, email: string, password: string): Promise<RemoteSession> {
  const body = (await call(cfg, '/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password }) })) as Partial<GoTrueSession>
  if (!body.access_token) {
    throw new RemoteError(200, 'confirm_email', 'Conta criada. Confirme pelo link no seu e-mail e depois entre com "Já tenho conta".')
  }
  return toSession(body as GoTrueSession)
}

export async function signIn(cfg: RemoteConfig, email: string, password: string): Promise<RemoteSession> {
  return toSession((await call(cfg, '/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) })) as GoTrueSession)
}

export async function refresh(cfg: RemoteConfig, refreshToken: string): Promise<RemoteSession> {
  return toSession(
    (await call(cfg, '/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) })) as GoTrueSession,
  )
}

/** Revoga a sessão no servidor (refresh tokens deixam de valer) */
export async function signOut(cfg: RemoteConfig, accessToken: string): Promise<void> {
  await call(cfg, '/auth/v1/logout?scope=local', { method: 'POST', token: accessToken }).catch(() => undefined)
}

export async function rpc<T>(cfg: RemoteConfig, token: string, name: string, args: Record<string, unknown>): Promise<T> {
  return (await call(cfg, `/rest/v1/rpc/${name}`, { method: 'POST', token, body: JSON.stringify(args) })) as T
}

/* ---------- linhas <-> entidades ---------- */

export const TABLES: Record<CollectionName, string> = {
  couple: 'couples',
  profiles: 'profiles',
  tasks: 'tasks',
  events: 'events',
  meds: 'medications',
  medLogs: 'medication_logs',
  transactions: 'transactions',
  helpRequests: 'help_requests',
  nudges: 'nudges',
  cycleSettings: 'cycle_settings',
  cycleLogs: 'cycle_logs',
  shoppingItems: 'shopping_items',
  specialDates: 'special_dates',
  giftIdeas: 'gift_ideas',
  moodCheckins: 'mood_checkins',
  comfortItems: 'comfort_items',
  focusSessions: 'focus_sessions',
  savingsGoals: 'savings_goals',
  recurrences: 'recurrences',
}

/** Tabelas com chave (couple_id, id): um registro por pessoa */
const PER_PERSON = new Set<CollectionName>(['profiles', 'cycleSettings'])

/**
 * Tabela que o servidor ainda não tem (app publicado antes do schema.sql novo ser aplicado).
 * PostgREST responde 404 (PGRST205) ou repassa o 42P01 do Postgres.
 */
export const isMissingTable = (e: unknown) => e instanceof RemoteError && (e.status === 404 || e.code === 'PGRST205' || e.code === '42P01')

const snake = (k: string) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
const isTimestampKey = (k: string) => k.endsWith('At') || k === 'snoozeUntil'

/** Entidade local -> linha do Postgres. O código de convite nunca sai do aparelho. */
export function toRow(collection: CollectionName, entity: unknown, spaceId: string): Record<string, unknown> {
  const e = entity as Record<string, unknown>
  if (collection === 'couple') {
    return { id: spaceId, paired_at: e.pairedAt, split_mode: e.splitMode, ratio_a_bps: e.ratioABps, updated_at: e.updatedAt ?? new Date().toISOString() }
  }
  const row: Record<string, unknown> = { couple_id: spaceId, deleted: false }
  for (const [k, v] of Object.entries(e)) row[snake(k)] = v
  if (PER_PERSON.has(collection)) delete row.deleted
  // ciclo com "Só eu vejo": o par lê a linha (para saber que fechou), mas ela não diz nada além disso
  if (collection === 'cycleSettings' && e.share === 'NONE') {
    Object.assign(row, { cycle_days: 28, period_days: 5, suggest_calm: true, sensitive_from: null, sensitive_to: null })
  }
  return row
}

/** Linha do Postgres -> entidade local (normaliza datas para o mesmo formato ISO do aparelho) */
export function fromRow(collection: CollectionName, row: Record<string, unknown>): { entity: unknown; deleted: boolean; syncedAt: string } {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === 'couple_id' || k === 'deleted' || k === 'synced_at' || k === 'invite_code') continue
    const key = camel(k)
    // data inválida fica como veio: um registro estranho não pode derrubar o download inteiro
    const t = typeof v === 'string' && isTimestampKey(key) ? new Date(v) : null
    out[key] = t && !Number.isNaN(t.getTime()) ? t.toISOString() : v
  }
  if (collection === 'couple') {
    out.spaceId = out.id
    out.id = 'couple'
  }
  return { entity: out, deleted: row.deleted === true, syncedAt: String(row.synced_at ?? '') }
}

export async function upsertRow(cfg: RemoteConfig, token: string, collection: CollectionName, row: Record<string, unknown>) {
  const conflict = PER_PERSON.has(collection) ? '?on_conflict=couple_id,id' : ''
  await call(cfg, `/rest/v1/${TABLES[collection]}${conflict}`, {
    method: 'POST',
    token,
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  })
}

/** Exclusão lógica: o outro aparelho fica sabendo pelo pull */
export async function softDelete(cfg: RemoteConfig, token: string, collection: CollectionName, id: string, spaceId: string) {
  if (collection === 'couple' || PER_PERSON.has(collection)) return
  await call(cfg, `/rest/v1/${TABLES[collection]}?id=eq.${encodeURIComponent(id)}&couple_id=eq.${encodeURIComponent(spaceId)}`, {
    method: 'PATCH',
    token,
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ deleted: true, updated_at: new Date().toISOString() }),
  })
}

export async function pullRows(cfg: RemoteConfig, token: string, collection: CollectionName, spaceId: string, since: string | null) {
  const idCol = collection === 'couple' ? 'id' : 'couple_id'
  const params = new URLSearchParams({ select: '*', [idCol]: `eq.${spaceId}`, order: 'synced_at.asc' })
  if (since) params.set('synced_at', `gt.${since}`)
  return (await call(cfg, `/rest/v1/${TABLES[collection]}?${params.toString()}`, { method: 'GET', token })) as Record<string, unknown>[]
}

/**
 * Só os ids que o RLS ainda mostra (sem cursor). Serve para achar cópias locais que perderam a
 * autorização: o pull incremental nunca avisa que uma linha deixou de ser visível.
 */
export async function listIds(cfg: RemoteConfig, token: string, collection: CollectionName, spaceId: string): Promise<Set<string>> {
  const params = new URLSearchParams({ select: 'id', couple_id: `eq.${spaceId}` })
  const rows = (await call(cfg, `/rest/v1/${TABLES[collection]}?${params.toString()}`, { method: 'GET', token })) as { id: string }[]
  return new Set(rows.map((r) => String(r.id)))
}
