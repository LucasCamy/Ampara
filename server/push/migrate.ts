import { createHash } from 'node:crypto'
import pg from 'pg'

/**
 * Aplica supabase/schema.sql no início do backend, sem passo manual no cluster.
 * - Espera o GoTrue criar auth.users (o schema referencia a tabela).
 * - Trava com advisory lock: duas réplicas subindo juntas não aplicam ao mesmo tempo.
 * - Só aplica quando o arquivo mudou (hash guardado em ampara_meta, fora do alcance da API REST).
 * - Tudo numa transação: se o SQL falhar, nada fica pela metade e o processo sai com erro.
 * - Avisa o PostgREST para recarregar o schema.
 */

const LOCK_KEY = 727_400_001

export type MigrateResult = { status: 'applied' | 'unchanged'; hash: string }

export async function waitForAuth(db: pg.Pool, log: (m: string) => void, tries = 90, delayMs = 2000) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await db.query<{ ok: string | null }>("select to_regclass('auth.users')::text as ok")
      if (r.rows[0]?.ok) return
    } catch {
      /* banco ainda subindo */
    }
    if (i % 10 === 0) log('aguardando o banco e o Auth (auth.users)...')
    await new Promise((res) => setTimeout(res, delayMs))
  }
  throw new Error('auth.users não apareceu: o Auth (GoTrue) está rodando?')
}

export async function migrate(db: pg.Pool, sql: string, log: (m: string) => void = () => undefined): Promise<MigrateResult> {
  const hash = createHash('sha256').update(sql).digest('hex')
  const client = await db.connect()
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY])
    await client.query('create schema if not exists ampara_meta')
    await client.query('revoke all on schema ampara_meta from public')
    await client.query('create table if not exists ampara_meta.schema_versions (hash text primary key, applied_at timestamptz not null default now())')
    const done = await client.query('select 1 from ampara_meta.schema_versions where hash = $1', [hash])
    if (done.rowCount) return { status: 'unchanged', hash }
    await client.query("set client_min_messages = 'warning'")
    await client.query('begin')
    try {
      // vários comandos num texto só: protocolo simples (sem parâmetros)
      await client.query(sql)
      await client.query('insert into ampara_meta.schema_versions (hash) values ($1)', [hash])
      await client.query('commit')
    } catch (e) {
      await client.query('rollback')
      throw e
    }
    await client.query("notify pgrst, 'reload schema'")
    log(`schema aplicado (${hash.slice(0, 12)})`)
    return { status: 'applied', hash }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined)
    client.release()
  }
}
