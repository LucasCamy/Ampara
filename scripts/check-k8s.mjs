// Confere os manifestos (k8s/deploy.yaml e o workflow do CI): YAML válido e o que o deploy depende.
//   npm run k8s:check
import { readFileSync } from 'node:fs'
import { parse, parseAllDocuments } from 'yaml'

let failures = 0
const ok = (cond, msg) => {
  if (cond) console.log(`ok  ${msg}`)
  else {
    failures += 1
    console.error(`FALHOU: ${msg}`)
  }
}

const docs = parseAllDocuments(readFileSync('k8s/deploy.yaml', 'utf8'))
const errors = docs.flatMap((d) => d.errors)
ok(errors.length === 0, `k8s/deploy.yaml é YAML válido${errors.length ? `: ${errors[0].message}` : ''}`)
const objs = docs.map((d) => d.toJS()).filter(Boolean)
const byName = (kind, name) => objs.find((o) => o.kind === kind && o.metadata?.name === name)
ok(objs.every((o) => o.metadata?.namespace === 'ampara' || o.kind === 'Namespace'), 'todos os objetos no namespace ampara')

const auth = byName('Deployment', 'ampara-auth')
const env = (c) => Object.fromEntries((c.env ?? []).map((e) => [e.name, e.value ?? `secret:${e.valueFrom?.secretKeyRef?.key}`]))
// cadastro aberto é uma escolha (ex.: o par criando a conta): avisa, não reprova
if (env(auth.spec.template.spec.containers[0]).GOTRUE_DISABLE_SIGNUP === 'true') console.log('ok  cadastro fechado no Auth (GOTRUE_DISABLE_SIGNUP=true)')
else console.log('AVISO: cadastro de contas ABERTO no Auth (GOTRUE_DISABLE_SIGNUP=false). Feche quando os dois tiverem conta.')

const rest = byName('Deployment', 'ampara-rest')
ok(!rest.spec.template.spec.initContainers, 'ampara-rest sem migração própria (quem migra é o backend)')

const push = byName('Deployment', 'ampara-push')
const init = push.spec.template.spec.initContainers?.find((c) => c.name === 'migrate')
const worker = push.spec.template.spec.containers.find((c) => c.name === 'push')
ok(init && init.args?.includes('--migrate-only') && env(init).MIGRATE_DATABASE_URL?.startsWith('postgres://postgres:'), 'backend: migração num initContainer com o administrador')
ok(worker && env(worker).DATABASE_URL?.startsWith('postgres://ampara_worker:'), 'backend: worker conecta com o papel restrito ampara_worker')
ok(worker && !Object.values(env(worker)).some((v) => String(v).includes('POSTGRES_PASSWORD')), 'worker não recebe a senha de administrador')
for (const c of [init, worker].filter(Boolean)) ok(c.securityContext?.runAsNonRoot && c.securityContext?.runAsUser, `${c.name}: roda sem root com UID numérico`)

const cron = byName('CronJob', 'ampara-backup')
ok(cron && byName('PersistentVolumeClaim', 'ampara-backup-pvc'), 'backup: CronJob e volume próprio')
const script = cron?.spec.jobTemplate.spec.template.spec.containers[0].command?.[2] ?? ''
ok(/pg_dump .* -n public -n ampara_meta/.test(script) && /--data-only -t auth\.users -t auth\.identities/.test(script), 'backup: dump do app e das contas (como o backup:check ensaia)')
ok(cron?.spec.concurrencyPolicy === 'Forbid' && cron?.spec.timeZone, 'backup: sem execução sobreposta e com fuso')

const wf = parse(readFileSync('.github/workflows/deploy.yml', 'utf8'))
const steps = Object.values(wf.jobs).flatMap((j) => j.steps ?? [])
ok(steps.some((s) => s.with?.file === 'Dockerfile.push') && steps.some((s) => String(s.with?.tags).includes('ghcr.io/lucascamy/ampara:latest')), 'CI publica as duas imagens')

if (failures) {
  console.error(`\n${failures} verificação(ões) falharam`)
  process.exit(1)
}
console.log('\nTUDO CERTO: manifestos conferidos')
