import type { BrowserContext, Route } from '@playwright/test'

/**
 * Supabase simulado em memória para E2E de dois aparelhos.
 * Emula GoTrue (signup, token, refresh, logout), as RPCs de pareamento e as políticas RLS
 * de supabase/schema.sql (isolamento por casal + privacidade financeira + remédios + tarefas).
 * Não substitui um teste contra o Postgres real (ver SECURITY.md: needs_validation).
 */
export const FAKE_URL = 'http://fake-supabase.test'

type Row = Record<string, unknown>
interface User {
  id: string
  email: string
  password: string
}
interface Member {
  couple_id: string
  user_id: string
  partner_id: 'A' | 'B'
}

const norm = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '')

export class FakeSupabase {
  users = new Map<string, User>()
  access = new Map<string, { userId: string; exp: number }>()
  refresh = new Map<string, string>()
  members: Member[] = []
  invites: { hash: string; couple_id: string; partner_id: 'A' | 'B'; used: boolean }[] = []
  tables = new Map<string, Map<string, Row>>()
  /** pedidos recebidos com Authorization ausente ou chave anônima tentando gravar */
  anonWrites = 0
  /** inscrições de push (espelho de save_push_subscription / delete_push_subscription) */
  pushSubs = new Map<string, { couple_id: string; partner_id: 'A' | 'B'; p256dh: string; auth: string; tz: string; show_details: boolean }>()
  /** chave pública VAPID que o "servidor" anuncia (65 bytes, P-256) */
  vapidPublicKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
  failures: string[] = []
  private seq = 0

  private table(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map())
    return this.tables.get(name)!
  }

  private stamp() {
    this.seq += 1
    return new Date(Date.UTC(2026, 10, 6, 0, 0, 0, this.seq)).toISOString()
  }

  private session(user: User) {
    const access = `at-${crypto.randomUUID()}`
    const refreshToken = `rt-${crypto.randomUUID()}`
    this.access.set(access, { userId: user.id, exp: Date.now() + 3600_000 })
    this.refresh.set(refreshToken, user.id)
    return { access_token: access, refresh_token: refreshToken, expires_in: 3600, token_type: 'bearer', user: { id: user.id, email: user.email } }
  }

  private me(route: Route): Member | null | 'anon' {
    const auth = route.request().headers()['authorization'] ?? ''
    const token = auth.replace(/^Bearer /, '')
    const s = this.access.get(token)
    if (!s || s.exp < Date.now()) return 'anon'
    return this.members.find((m) => m.user_id === s.userId) ?? null
  }

  private userOf(route: Route) {
    const token = (route.request().headers()['authorization'] ?? '').replace(/^Bearer /, '')
    return this.access.get(token)?.userId ?? null
  }

  /** Espelho das políticas *_read do schema */
  private canRead(table: string, row: Row, m: Member): boolean {
    if (table === 'couples') return row.id === m.couple_id
    if (row.couple_id !== m.couple_id) return false
    if (table === 'transactions') {
      if (row.created_by === m.partner_id || row.scope === 'COUPLE') return true
      const owner = this.table('profiles').get(`${m.couple_id}|${String(row.created_by)}`)
      return row.scope === 'PERSONAL' && row.is_secret_gift === false && owner?.share_personal_finances === true
    }
    // recurrences_read: do casal ou minha
    if (table === 'recurrences') return row.scope === 'COUPLE' || row.created_by === m.partner_id
    if (table === 'tasks') return row.assigned_to == null || row.assigned_to === m.partner_id || row.sent_by === m.partner_id || row.visible_to_partner === true
    if (table === 'medications') return row.owner_id == null || row.owner_id === m.partner_id || row.notify_partner_on_delay === true
    if (table === 'events') return row.owner_id == null || row.owner_id === m.partner_id
    // cycle_settings_read / cycle_logs_read
    if (table === 'cycle_settings') return true
    // gift_ideas_read: presente é surpresa, só quem anotou
    if (table === 'gift_ideas') return row.owner_id === m.partner_id
    if (table === 'cycle_logs') {
      if (row.owner_id === m.partner_id) return true
      return this.table('cycle_settings').get(`${m.couple_id}|${String(row.owner_id)}`)?.share === 'FULL'
    }
    if (table === 'medication_logs') {
      // logs_read: a dose segue o remédio (subconsulta sob o RLS de medications)
      const med = this.table('medications').get(String(row.medication_id))
      return !!med && this.canRead('medications', med, m)
    }
    return true
  }

  /** Espelho das políticas de gravação (*_insert / *_update / *_delete, using e with check) */
  private canWrite(table: string, row: Row, m: Member): boolean {
    if (table === 'couples') return row.id === m.couple_id
    if (row.couple_id !== m.couple_id) return false
    // profiles_update: só o próprio perfil, ou o do par antes de ele(a) entrar na nuvem
    if (table === 'profiles') return row.id === m.partner_id || !this.members.some((x) => x.couple_id === m.couple_id && x.partner_id === row.id)
    if (table === 'transactions' || table === 'recurrences') return row.scope === 'COUPLE' || row.created_by === m.partner_id
    if (table === 'medications' || table === 'events') return row.owner_id == null || row.owner_id === m.partner_id
    if (table === 'medication_logs' || table === 'tasks') return this.canRead(table, row, m)
    if (table === 'cycle_settings') return row.id === m.partner_id
    if (table === 'cycle_logs') return row.owner_id === m.partner_id
    if (table === 'gift_ideas' || table === 'mood_checkins' || table === 'comfort_items') return row.owner_id === m.partner_id
    return true
  }

  async handle(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const body = (req.postData() ? JSON.parse(req.postData()!) : {}) as Row
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, prefer', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' }
    const json = (status: number, data: unknown) => {
      if (status >= 300) this.failures.push(`${req.method()} ${path} ${status} ${JSON.stringify(data).slice(0, 80)}`)
      return route.fulfill({ status, headers: cors, contentType: 'application/json', body: data === null ? '' : JSON.stringify(data) })
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' })

    // GoTrue
    if (path === '/auth/v1/signup') {
      const email = String(body.email).toLowerCase()
      if (this.users.has(email)) return json(422, { code: 'user_already_exists', msg: 'User already registered' })
      const user = { id: crypto.randomUUID(), email, password: String(body.password) }
      this.users.set(email, user)
      return json(200, this.session(user))
    }
    if (path === '/auth/v1/token') {
      const grant = url.searchParams.get('grant_type')
      if (grant === 'password') {
        const user = this.users.get(String(body.email).toLowerCase())
        if (!user || user.password !== body.password) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
        return json(200, this.session(user))
      }
      const uid = this.refresh.get(String(body.refresh_token))
      if (!uid) return json(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' })
      this.refresh.delete(String(body.refresh_token)) // rotação
      return json(200, this.session([...this.users.values()].find((u) => u.id === uid)!))
    }
    if (path === '/auth/v1/logout') {
      const uid = this.userOf(route)
      for (const [k, v] of this.refresh) if (v === uid) this.refresh.delete(k)
      return json(204, null)
    }

    const me = this.me(route)
    if (me === 'anon') {
      if (req.method() !== 'GET') this.anonWrites += 1
      return json(401, { message: 'JWT expired or missing' })
    }
    const uid = this.userOf(route)!

    // RPCs
    if (path.startsWith('/rest/v1/rpc/')) {
      const name = path.slice('/rest/v1/rpc/'.length)
      if (name === 'push_public_key') return json(200, me ? this.vapidPublicKey : null)
      if (name === 'save_push_subscription') {
        if (!me) return json(400, { message: 'not paired' })
        if (!/^https:\/\//.test(String(body.p_endpoint))) return json(400, { message: 'invalid subscription' })
        this.pushSubs.set(String(body.p_endpoint), {
          couple_id: me.couple_id,
          partner_id: me.partner_id,
          p256dh: String(body.p_p256dh),
          auth: String(body.p_auth),
          tz: String(body.p_tz || 'America/Sao_Paulo'),
          show_details: body.p_show_details === true,
        })
        return json(200, null)
      }
      if (name === 'delete_push_subscription') {
        const sub = this.pushSubs.get(String(body.p_endpoint))
        if (me && sub && sub.couple_id === me.couple_id && sub.partner_id === me.partner_id) this.pushSubs.delete(String(body.p_endpoint))
        return json(200, null)
      }
      if (name === 'my_membership') return json(200, me ? [{ couple_id: me.couple_id, partner_id: me.partner_id }] : [])
      if (name === 'create_couple') {
        if (me) return json(400, { message: 'already paired' })
        const id = String(body.p_couple_id)
        this.table('couples').set(id, { id, split_mode: body.p_split_mode, ratio_a_bps: body.p_ratio_a_bps, synced_at: this.stamp() })
        this.members.push({ couple_id: id, user_id: uid, partner_id: 'A' })
        return json(200, id)
      }
      if (name === 'create_invite') {
        if (!me) return json(400, { message: 'not paired' })
        const partner = me.partner_id === 'A' ? 'B' : 'A'
        this.invites = this.invites.filter((i) => i.couple_id !== me.couple_id)
        this.invites.push({ hash: norm(String(body.p_code)), couple_id: me.couple_id, partner_id: partner, used: false })
        return json(200, null)
      }
      if (name === 'join_couple') {
        const inv = this.invites.find((i) => i.hash === norm(String(body.p_code)) && !i.used)
        if (!inv || me) return json(400, { message: 'invalid invite' })
        inv.used = true
        this.members.push({ couple_id: inv.couple_id, user_id: uid, partner_id: inv.partner_id })
        return json(200, [{ couple_id: inv.couple_id, partner_id: inv.partner_id }])
      }
      return json(404, { message: 'unknown rpc' })
    }

    // PostgREST
    const tableName = path.replace('/rest/v1/', '')
    const t = this.table(tableName)
    const keyOf = (row: Row) => (tableName === 'profiles' || tableName === 'cycle_settings' ? `${String(row.couple_id)}|${String(row.id)}` : String(row.id))
    if (!me) return json(403, { message: 'not a member' })

    if (req.method() === 'GET') {
      const since = url.searchParams.get('synced_at')?.replace(/^gt\./, '') ?? null
      const rows = [...t.values()]
        .filter((r) => this.canRead(tableName, r, me))
        .filter((r) => !since || String(r.synced_at) > since)
        .sort((a, b) => String(a.synced_at).localeCompare(String(b.synced_at)))
      return json(200, rows)
    }
    if (req.method() === 'POST') {
      const key = keyOf(body)
      const existing = t.get(key)
      // upsert: a linha nova passa no with check; a que já existe precisa passar no using do update
      const insertOk = tableName === 'tasks' || tableName === 'profiles' ? body.couple_id === me.couple_id : this.canWrite(tableName, body, me)
      // resolution=ignore-duplicates: ON CONFLICT DO NOTHING (o insert ainda passa no with check)
      if (insertOk && existing && /ignore-duplicates/.test(req.headers()['prefer'] ?? '')) return json(201, null)
      if (!insertOk || (existing && !this.canWrite(tableName, existing, me))) {
        return json(403, { code: '42501', message: 'new row violates row-level security policy' })
      }
      // espelho de keep_newest(): versão mais velha não sobrescreve a mais nova (a linha volta com synced_at novo)
      if (existing && (tableName === 'transactions' || tableName === 'recurrences') && String(body.updated_at) < String(existing.updated_at)) {
        t.set(key, { ...existing, synced_at: this.stamp() })
        return json(201, null)
      }
      t.set(key, { ...(existing ?? {}), ...body, synced_at: this.stamp() })
      return json(201, null)
    }
    if (req.method() === 'PATCH') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '') ?? ''
      const row = t.get(id)
      // update sem permissão no using: 0 linhas, sem erro (como no PostgREST)
      if (!row || !this.canWrite(tableName, row, me)) return json(204, null)
      t.set(id, { ...row, ...body, synced_at: this.stamp() })
      return json(204, null)
    }
    return json(405, { message: 'method not allowed' })
  }

  attach(context: BrowserContext) {
    return context.route(`${FAKE_URL}/**`, async (route) => {
      try {
        await this.handle(route)
      } catch (e) {
        this.failures.push(`EXCEPTION ${route.request().method()} ${route.request().url()} ${String(e)}`)
        await route.fulfill({ status: 500, body: '' }).catch(() => undefined)
      }
    })
  }
}
