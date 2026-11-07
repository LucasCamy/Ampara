/**
 * Teste de integração do Web Push contra o Postgres real do Docker (npm run db:up antes).
 *   npm run push:check
 * Cria um casal de teste, sobe um "serviço de push" HTTPS falso, roda ciclos do worker e DECIFRA o que chegou
 * do mesmo jeito que o navegador (RFC 8291 aes128gcm + VAPID RFC 8292). No fim apaga tudo o que criou.
 */
import { execFileSync } from 'node:child_process'
import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { localParts } from '../server/push/plan'
import { enableWorkerLogin } from '../server/push/migrate'
import { tick } from '../server/push/worker'

// só neste processo de teste: o serviço de push falso usa certificado autoassinado
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const DB = process.env.DATABASE_URL ?? 'postgres://postgres:ampara-local-postgres@localhost:54322/postgres'
const SUBJECT = 'https://ampara.test'
let failures = 0
const ok = (cond: unknown, msg: string) => {
  if (cond) console.log(`ok  ${msg}`)
  else {
    failures += 1
    console.error(`FALHOU: ${msg}`)
  }
}

/* ---------- serviço de push falso (HTTPS) ---------- */
const dir = mkdtempSync(join(tmpdir(), 'ampara-push-'))
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'ignore' })
interface Received {
  path: string
  headers: Record<string, string | string[] | undefined>
  body: Buffer
}
const received: Received[] = []
let reply = 201
const server = createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, (req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (c: Buffer) => chunks.push(c))
  req.on('end', () => {
    received.push({ path: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) })
    res.writeHead(reply).end()
  })
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const port = (server.address() as AddressInfo).port

/* ---------- inscrição como um navegador faria (chaves do "aparelho") ---------- */
function device(name: string) {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const auth = randomBytes(16)
  return { endpoint: `https://localhost:${port}/push/${name}-${randomUUID()}`, ecdh, auth, p256dh: ecdh.getPublicKey().toString('base64url'), authB64: auth.toString('base64url') }
}

/** RFC 8291: decifra o corpo aes128gcm com a chave privada e o segredo do aparelho */
function decrypt(body: Buffer, dev: ReturnType<typeof device>): string {
  const salt = body.subarray(0, 16)
  const idlen = body[20]!
  const asPublic = body.subarray(21, 21 + idlen)
  const ciphertext = body.subarray(21 + idlen)
  const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest()
  const ecdhSecret = dev.ecdh.computeSecret(asPublic)
  const prkKey = hmac(dev.auth, ecdhSecret)
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), dev.ecdh.getPublicKey(), asPublic, Buffer.from([1])]))
  const prk = hmac(salt, ikm)
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16)
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12)
  const d = createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(ciphertext.subarray(ciphertext.length - 16))
  const plain = Buffer.concat([d.update(ciphertext.subarray(0, ciphertext.length - 16)), d.final()])
  // último registro: conteúdo, delimitador 0x02 e zeros
  return plain.subarray(0, plain.lastIndexOf(2)).toString('utf8')
}

/** RFC 8292: confere o JWT VAPID (ES256) com a chave pública anunciada */
function checkVapid(header: string | string[] | undefined, endpoint: string, publicKey: string): boolean {
  const m = /vapid t=([^,]+),\s*k=(.+)/.exec(String(header))
  if (!m || m[2] !== publicKey) return false
  const [h, p, s] = m[1]!.split('.')
  const raw = Buffer.from(publicKey, 'base64url')
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33, 65).toString('base64url') }, format: 'jwk' })
  const signed = verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s!, 'base64url'))
  const claims = JSON.parse(Buffer.from(p!, 'base64url').toString()) as { aud: string; exp: number; sub: string }
  return signed && claims.aud === new URL(endpoint).origin && claims.exp * 1000 > Date.now() && claims.sub === SUBJECT
}

/* ---------- dados de teste ---------- */
const db = new pg.Pool({ connectionString: DB, max: 2 })
// os ciclos do worker rodam com o papel restrito (o mesmo da produção): prova que as permissões bastam
const WORKER_PW = 'ampara-local-worker-senha'
await enableWorkerLogin(db, WORKER_PW)
const workerDb = new pg.Pool({ connectionString: DB.replace(/\/\/[^@]+@/, `//ampara_worker:${WORKER_PW}@`), max: 2 })
const couple = `push-check-${randomUUID()}`
const ela = device('ela')
const ele = device('ele')
const now = new Date()
const { minutes } = localParts(now, 'America/Sao_Paulo')
const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
const medId = randomUUID()
const opts = { databaseUrl: DB, subject: SUBJECT }

try {
  await db.query("insert into couples (id, split_mode) values ($1, '50_50')", [couple])
  await db.query("insert into profiles (id, couple_id, display_name, pronoun, energy) values ('A', $1, 'Lucas', 'ele', 'FULL'), ('B', $1, 'Julia Aparecida', 'ela', 'FULL')", [couple])
  await db.query(
    "insert into medications (id, couple_id, kind, owner_id, name, dosage, times, notify_partner_on_delay) values ($1, $2, 'MED', 'B', 'Venvanse 30mg', '1 cápsula', $3, true)",
    [medId, couple, JSON.stringify([hhmm])],
  )
  for (const [dev, who] of [[ela, 'B'], [ele, 'A']] as const) {
    await db.query("insert into push_subscriptions (endpoint, couple_id, partner_id, p256dh, auth, tz, show_details) values ($1, $2, $3, $4, $5, 'America/Sao_Paulo', false)", [
      dev.endpoint,
      couple,
      who,
      dev.p256dh,
      dev.authB64,
    ])
  }

  // 1) remédio dela na hora: só ela recebe, sem o nome do remédio na tela bloqueada
  const r1 = await tick(workerDb, opts, now)
  const pub = (await db.query<{ public_key: string }>('select public_key from push_config where id = 1')).rows[0]!.public_key
  ok(r1.sent === 1 && received.length === 1, `um envio no horário (enviados ${r1.sent}, recebidos ${received.length})`)
  const got = received[0]
  ok(got && got.path === new URL(ela.endpoint).pathname, 'foi para o aparelho dela, não para o dele')
  ok(got?.headers['content-encoding'] === 'aes128gcm' && Number(got.headers.ttl) > 0, 'cifrado (aes128gcm) com TTL')
  ok(got && checkVapid(got.headers.authorization, ela.endpoint, pub), 'assinatura VAPID válida com a chave do servidor')
  const payload = got ? (JSON.parse(decrypt(got.body, ela)) as { title: string; body: string; url: string }) : null
  ok(payload?.title === 'Hora do seu remédio' && payload.url === '/?quick=med', `o aparelho decifra a notificação: "${payload?.title}"`)
  ok(payload && !JSON.stringify(payload).includes('Venvanse'), 'sem o nome do remédio (detalhes desligados)')
  ok(got && !got.body.toString('latin1').includes('Hora do seu'), 'o serviço de push não consegue ler o texto')

  // 2) próximo ciclo: não repete
  const r2 = await tick(workerDb, opts, now)
  ok(r2.sent === 0 && r2.skipped === 1 && received.length === 1, 'o mesmo lembrete não sai duas vezes')

  // 3) pedido de ajuda dela; o navegador dele cancelou a inscrição (410): a inscrição some
  reply = 410
  await db.query("insert into help_requests (id, couple_id, requester_id, situation, help_type, urgency, status) values ($1, $2, 'B', 'Marcar dentista', 'BODY_DOUBLING', 'TODAY', 'OPEN')", [randomUUID(), couple])
  const r3 = await tick(workerDb, opts, new Date())
  const left = (await db.query('select 1 from push_subscriptions where endpoint = $1', [ele.endpoint])).rowCount
  ok(r3.removed === 1 && left === 0, 'inscrição cancelada (410) é removida do banco')

  // 4) serviço de push fora do ar: libera a reserva para tentar de novo
  reply = 503
  await db.query("insert into help_requests (id, couple_id, requester_id, situation, help_type, urgency, status) values ($1, $2, 'A', 'Lavar louça', 'TAKE_OVER', 'NOW', 'OPEN')", [randomUUID(), couple])
  const r4 = await tick(workerDb, opts, new Date())
  reply = 201
  const r5 = await tick(workerDb, opts, new Date())
  ok(r4.failed === 1 && r5.sent === 1, `falha temporária tenta de novo no próximo ciclo (falhas ${r4.failed}, depois enviados ${r5.sent})`)
} finally {
  await db.query('delete from push_sent where key like $1', [`%localhost:${port}%`])
  await db.query('delete from couples where id = $1', [couple])
  await db.end()
  await workerDb.end()
  server.close()
  rmSync(dir, { recursive: true, force: true })
}

if (failures) {
  console.error(`\n${failures} verificação(ões) falharam`)
  process.exit(1)
}
console.log('\nTUDO CERTO: worker de push contra o Postgres real, cifra e VAPID conferidos (dados de teste apagados)')
