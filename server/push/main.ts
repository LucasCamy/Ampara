import { readFileSync } from 'node:fs'
import pg from 'pg'
import { enableWorkerLogin, migrate, waitForAuth } from './migrate'
import { run } from './worker'

/**
 * Backend do Ampara. Duas etapas, cada uma com a sua credencial (no k8s, containers separados):
 *   node worker.mjs --migrate-only   aplica o schema.sql e liga o login do papel ampara_worker
 *       MIGRATE_DATABASE_URL  conexão de administrador (postgres)
 *       WORKER_DB_PASSWORD    senha do papel ampara_worker (opcional; sem ela o worker usa DATABASE_URL como vier)
 *       SCHEMA_PATH           arquivo do schema (padrão: ./schema.sql, copiado na imagem)
 *   node worker.mjs                  roda os lembretes
 *       DATABASE_URL          conexão do worker (no k8s: ampara_worker, só leitura do necessário)
 *       MIGRATE               "off" para não migrar neste processo (padrão quando MIGRATE_DATABASE_URL não existe)
 *       PUSH_SUBJECT          contato VAPID (padrão: URL do app)
 */
const log = (m: string) => console.log(`[backend] ${m}`)
const migrateOnly = process.argv.includes('--migrate-only')
const adminUrl = process.env.MIGRATE_DATABASE_URL
const workerUrl = process.env.DATABASE_URL

async function runMigration(url: string) {
  const db = new pg.Pool({ connectionString: url, max: 1 })
  try {
    await waitForAuth(db, log)
    const r = await migrate(db, readFileSync(process.env.SCHEMA_PATH || new URL('./schema.sql', import.meta.url), 'utf8'), log)
    if (r.status === 'unchanged') log(`schema já atualizado (${r.hash.slice(0, 12)})`)
    if (process.env.WORKER_DB_PASSWORD) {
      await enableWorkerLogin(db, process.env.WORKER_DB_PASSWORD)
      log('login do worker (ampara_worker) conferido')
    }
  } finally {
    await db.end()
  }
}

try {
  if (adminUrl && process.env.MIGRATE !== 'off') await runMigration(adminUrl)
  else if (migrateOnly) throw new Error('defina MIGRATE_DATABASE_URL para migrar')
} catch (e) {
  // sai com erro: o Kubernetes mostra a etapa falhando e a versão anterior do schema continua valendo
  console.error(`[backend] falha ao aplicar o schema: ${(e as Error).message}`)
  process.exit(1)
}

if (migrateOnly) process.exit(0)
if (!workerUrl) {
  console.error('[backend] defina DATABASE_URL')
  process.exit(1)
}
void run({ databaseUrl: workerUrl, subject: process.env.PUSH_SUBJECT || 'https://ampara.cloudlane.com.br' })

for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => process.exit(0))
