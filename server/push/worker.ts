import pg from 'pg'
import webpush from 'web-push'
import type { DoseStatus, Medication, PartnerId } from '../../src/domain/types'
import { fromServerPrefs } from '../../src/domain/alerts'
import { planNotifications, type DoseLog, type OpenFocus, type OpenHelp, type OpenNudge, type PlanInput, type PushMessage, type PushSub } from './plan'

/**
 * Worker de lembretes (Web Push). A cada ciclo: lê o necessário no Postgres, decide com planNotifications
 * (mesmas regras do app) e envia. Cada envio é "reservado" em push_sent antes de sair: dois workers ou um
 * reinício nunca mandam o mesmo lembrete duas vezes. Falha de rede devolve a reserva para tentar de novo.
 */

export interface WorkerOptions {
  databaseUrl: string
  /** contato do servidor de push (VAPID "sub"): URL do app ou mailto */
  subject: string
  log?: (msg: string) => void
}

interface Row {
  [k: string]: unknown
}

export async function ensureVapid(db: pg.Pool | pg.PoolClient): Promise<{ publicKey: string; privateKey: string }> {
  const found = await db.query<{ public_key: string; private_key: string }>('select public_key, private_key from push_config where id = 1')
  if (found.rows[0]) return { publicKey: found.rows[0].public_key, privateKey: found.rows[0].private_key }
  const keys = webpush.generateVAPIDKeys()
  // dois workers subindo juntos: o primeiro grava, o segundo lê o que ficou
  await db.query('insert into push_config (id, public_key, private_key) values (1, $1, $2) on conflict (id) do nothing', [keys.publicKey, keys.privateKey])
  const row = (await db.query<{ public_key: string; private_key: string }>('select public_key, private_key from push_config where id = 1')).rows[0]!
  return { publicKey: row.public_key, privateKey: row.private_key }
}

const asPartner = (v: unknown): PartnerId => (v === 'B' ? 'B' : 'A')

export async function loadInput(db: pg.Pool): Promise<PlanInput & { keys: Map<string, { p256dh: string; auth: string }> }> {
  const subs = (await db.query<Row>('select endpoint, couple_id, partner_id, p256dh, auth, tz, show_details, prefs from push_subscriptions')).rows
  const couples = [...new Set(subs.map((s) => String(s.couple_id)))]
  if (!couples.length) return { subs: [], meds: [], logs: [], help: [], nudges: [], focus: [], names: {}, keys: new Map() }

  const meds = (await db.query<Row>('select * from medications where deleted = false and couple_id = any($1)', [couples])).rows
  const logs = (
    await db.query<Row>(
      "select id, couple_id, medication_id, status, snooze_until, snooze_count from medication_logs where deleted = false and couple_id = any($1) and scheduled_date between current_date - 1 and current_date + 1",
      [couples],
    )
  ).rows
  const help = (
    await db.query<Row>(
      "select id, couple_id, requester_id, situation, created_at from help_requests where deleted = false and status = 'OPEN' and couple_id = any($1) and created_at > now() - interval '30 minutes'",
      [couples],
    )
  ).rows
  const nudges = (
    await db.query<Row>(
      "select id, couple_id, \"to\", message, created_at from nudges where deleted = false and seen_at is null and couple_id = any($1) and created_at > now() - interval '30 minutes'",
      [couples],
    )
  ).rows
  const focus = (
    await db.query<Row>(
      "select id, couple_id, started_by, title, duration_min, started_at from focus_sessions where deleted = false and status = 'RUNNING' and joined_by is null and couple_id = any($1) and started_at > now() - interval '30 minutes'",
      [couples],
    )
  ).rows
  const profiles = (await db.query<Row>('select couple_id, id, display_name from profiles where couple_id = any($1)', [couples])).rows

  const names: PlanInput['names'] = {}
  for (const p of profiles) (names[String(p.couple_id)] ??= {})[asPartner(p.id)] = String(p.display_name)

  const pushSubs: PushSub[] = subs.map((s) => ({
    endpoint: String(s.endpoint),
    coupleId: String(s.couple_id),
    partnerId: asPartner(s.partner_id),
    tz: String(s.tz),
    showDetails: s.show_details === true,
    prefs: fromServerPrefs(s.prefs),
  }))
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v))

  return {
    subs: pushSubs,
    keys: new Map(subs.map((s) => [String(s.endpoint), { p256dh: String(s.p256dh), auth: String(s.auth) }])),
    meds: meds.map(
      (m): Medication & { coupleId: string } => ({
        id: String(m.id),
        coupleId: String(m.couple_id),
        kind: m.kind === 'ROUTINE' ? 'ROUTINE' : 'MED',
        ownerId: m.owner_id == null ? null : asPartner(m.owner_id),
        name: String(m.name),
        dosage: String(m.dosage),
        times: Array.isArray(m.times) ? (m.times as string[]) : [],
        weekdays: Array.isArray(m.weekdays) ? (m.weekdays as number[]) : [],
        stockCount: m.stock_count == null ? null : Number(m.stock_count),
        assignee: m.assignee == null ? null : asPartner(m.assignee),
        lowStockThreshold: Number(m.low_stock_threshold ?? 5),
        notifyPartnerOnDelay: m.notify_partner_on_delay === true,
        delayMinutesThreshold: Number(m.delay_minutes_threshold ?? 30),
        pack: (m.pack as Medication['pack']) ?? null,
        updatedAt: iso(m.updated_at) ?? '',
      }),
    ),
    logs: logs.map(
      (l): DoseLog => ({
        id: String(l.id),
        coupleId: String(l.couple_id),
        medicationId: String(l.medication_id),
        status: String(l.status) as DoseStatus,
        snoozeUntil: iso(l.snooze_until),
        snoozeCount: Number(l.snooze_count ?? 0),
      }),
    ),
    help: help.map(
      (h): OpenHelp => ({ id: String(h.id), coupleId: String(h.couple_id), requesterId: asPartner(h.requester_id), situation: String(h.situation), createdAt: iso(h.created_at) ?? '' }),
    ),
    nudges: nudges.map((n): OpenNudge => ({ id: String(n.id), coupleId: String(n.couple_id), to: asPartner(n.to), message: String(n.message), createdAt: iso(n.created_at) ?? '' })),
    focus: focus.map(
      (f): OpenFocus => ({
        id: String(f.id),
        coupleId: String(f.couple_id),
        startedBy: asPartner(f.started_by),
        title: String(f.title),
        durationMin: Number(f.duration_min),
        startedAt: iso(f.started_at) ?? '',
      }),
    ),
    names,
  }
}

export interface TickResult {
  planned: number
  sent: number
  skipped: number
  removed: number
  failed: number
}

/** Um ciclo completo. Exportado para o teste de integração rodar um ciclo de cada vez. */
export async function tick(db: pg.Pool, opts: WorkerOptions, now = new Date()): Promise<TickResult> {
  const vapid = await ensureVapid(db)
  const input = await loadInput(db)
  const plan: PushMessage[] = planNotifications(input, now)
  const r: TickResult = { planned: plan.length, sent: 0, skipped: 0, removed: 0, failed: 0 }
  for (const msg of plan) {
    const claimed = await db.query('insert into push_sent (key) values ($1) on conflict (key) do nothing returning key', [msg.key])
    if (!claimed.rowCount) {
      r.skipped += 1
      continue
    }
    const keys = input.keys.get(msg.endpoint)
    if (!keys) continue
    try {
      await webpush.sendNotification(
        { endpoint: msg.endpoint, keys },
        JSON.stringify({ title: msg.title, body: msg.body, tag: msg.tag, url: msg.url, category: msg.category, sound: msg.sound, label: msg.label, key: msg.ref }),
        { TTL: 15 * 60, urgency: msg.category === 'help' || msg.category === 'med' ? 'high' : 'normal', vapidDetails: { subject: opts.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey }, timeout: 10_000 },
      )
      r.sent += 1
      await db.query('update push_subscriptions set last_ok_at = now() where endpoint = $1', [msg.endpoint])
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        // o navegador cancelou a inscrição: some daqui também
        await db.query('delete from push_subscriptions where endpoint = $1', [msg.endpoint])
        r.removed += 1
      } else {
        // rede ou serviço de push fora: libera a reserva para o próximo ciclo
        await db.query('delete from push_sent where key = $1', [msg.key])
        r.failed += 1
        opts.log?.(`falha ao enviar (${status ?? 'rede'}): ${(e as Error).message}`)
      }
    }
  }
  await db.query("delete from push_sent where sent_at < now() - interval '3 days'")
  return r
}

/** Laço do processo: um ciclo a cada 30 s, sem sobrepor */
export async function run(opts: WorkerOptions, intervalMs = 30_000): Promise<never> {
  const db = new pg.Pool({ connectionString: opts.databaseUrl, max: 2 })
  const log = opts.log ?? ((m: string) => console.log(`[push] ${m}`))
  log('worker de lembretes iniciado')
  for (;;) {
    try {
      const r = await tick(db, opts)
      if (r.planned) log(`planejados ${r.planned}, enviados ${r.sent}, repetidos ${r.skipped}, inscrições removidas ${r.removed}, falhas ${r.failed}`)
    } catch (e) {
      log(`ciclo falhou: ${(e as Error).message}`)
    }
    await new Promise((res) => setTimeout(res, intervalMs))
  }
}
