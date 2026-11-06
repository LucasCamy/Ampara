import { run } from './worker'

/**
 * Processo do worker de lembretes.
 *   DATABASE_URL   conexão com o Postgres (precisa ler todos os casais: role com BYPASSRLS ou dono das tabelas)
 *   PUSH_SUBJECT   contato VAPID (padrão: URL do app)
 */
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('[push] defina DATABASE_URL')
  process.exit(1)
}
void run({ databaseUrl, subject: process.env.PUSH_SUBJECT || 'https://ampara.cloudlane.com.br' })

for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => process.exit(0))
