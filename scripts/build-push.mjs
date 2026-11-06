// Empacota o worker de lembretes (server/push) com as regras de src/domain num único arquivo para o Node.
// Uso: node scripts/build-push.mjs [entrada] [saída]
import { rolldown } from 'rolldown'

const input = process.argv[2] ?? 'server/push/main.ts'
const file = process.argv[3] ?? 'dist-push/worker.mjs'
const bundle = await rolldown({ input, platform: 'node', external: ['pg', 'web-push', /^node:/] })
await bundle.write({ file, format: 'esm', sourcemap: false })
await bundle.close()
console.log(`push: ${input} -> ${file}`)
