import { readFileSync } from 'node:fs'
import pg from 'pg'
import { migrate, waitForAuth } from './migrate'
import { run } from './worker'

/**
 * Backend do Ampara: atualiza o banco (schema.sql) e depois roda o worker de lembretes.
 *   DATABASE_URL   conexão com o Postgres (dono das tabelas: aplica o schema e lê todos os casais)
 *   PUSH_SUBJECT   contato VAPID (padrão: URL do app)
 *   SCHEMA_PATH    arquivo do schema (padrão: ./schema.sql, copiado na imagem)
 *   MIGRATE        "off" para não aplicar o schema (ex.: banco gerenciado por outro processo)
 */
const log = (m: string) => console.log(`[backend] ${m}`)
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('[backend] defina DATABASE_URL')
  process.exit(1)
}

if (process.env.MIGRATE !== 'off') {
  const db = new pg.Pool({ connectionString: databaseUrl, max: 1 })
  try {
    await waitForAuth(db, log)
    const r = await migrate(db, readFileSync(process.env.SCHEMA_PATH || new URL('./schema.sql', import.meta.url), 'utf8'), log)
    if (r.status === 'unchanged') log(`schema já atualizado (${r.hash.slice(0, 12)})`)
  } catch (e) {
    // sai com erro: o Kubernetes mostra o pod falhando e a versão anterior do schema continua valendo
    console.error(`[backend] falha ao aplicar o schema: ${(e as Error).message}`)
    process.exit(1)
  } finally {
    await db.end()
  }
}

void run({ databaseUrl, subject: process.env.PUSH_SUBJECT || 'https://ampara.cloudlane.com.br' })

for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => process.exit(0))
