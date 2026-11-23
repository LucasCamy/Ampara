// Teste REAL do exe com nuvem: Supabase LOCAL do Docker (npm run db:up) + IA pela assinatura.
// Conta e senha de teste geradas aqui (nada real). Confere no Postgres que as ideias subiram.
// Rode na raiz:  npx vite build --mode docker --outDir <pasta>  e depois  AMPARA_DIST=<pasta> node desktop/test/live-cloud.cjs
const { _electron: electron } = require('playwright-core')
const { execFileSync } = require('child_process')
const assert = require('assert')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const sql = (q) => execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', q], { cwd: ROOT, encoding: 'utf8' }).trim()
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

;(async () => {
  assert.ok(process.env.AMPARA_DIST, 'defina AMPARA_DIST com o build em modo docker')
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, AMPARA_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'ampara-cloud-')), AMPARA_CLOUD: 'http://localhost:54321' },
  })
  const errors = []
  try {
    const page = await app.firstWindow()
    page.on('pageerror', (e) => errors.push(String(e)))
    page.setDefaultTimeout(30000)
    const run = crypto.randomBytes(4).toString('hex')
    const password = `teste-${crypto.randomBytes(8).toString('hex')}`
    const email = `desktop-${run}@ampara.local`

    await page.waitForSelector('[data-testid="setup-form"]')
    await page.evaluate(() => ['A', 'B'].forEach((p) => localStorage.setItem(`ampara:tour:${p}`, 'done')))
    await page.getByTestId('setup-name').fill('Teste')
    await page.getByTestId('setup-password').fill(password)
    await page.getByTestId('setup-password2').fill(password)
    await page.getByTestId('setup-partner').fill('Par de teste')
    await page.getByTestId('setup-submit').click()
    await page.getByTestId('welcome-enter').click()
    await page.waitForSelector('[data-testid="app"]')

    // nuvem: cria a conta de teste no Supabase local (pedido CORS passa pelo exe)
    await page.locator('[data-testid="side-ajustes"]:visible').first().click()
    await page.getByTestId('settings-group-nuvem').click()
    await page.getByTestId('cloud-email').fill(email)
    await page.getByTestId('cloud-password').fill(password)
    await page.getByTestId('cloud-submit').click()
    await page.getByTestId('cloud-section').getByText(`Conectado como ${email}`).waitFor()
    console.log('conta de teste conectada na nuvem local')

    await page.locator('[data-testid="side-ideias"]:visible').first().click()
    await page.getByTestId('idea-capture-input').fill('preciso organizar as finanças da casa e quero começar uma reserva de emergência este mês')
    await page.getByTestId('idea-capture-save').click()
    await page.getByTestId('idea-organizing').waitFor()
    await page.waitForFunction(() => !document.querySelector('[data-testid="idea-organizing"]'), null, { timeout: 180000 })
    const sync = page.locator('[data-testid="sync-pill"]:visible')
    // a fila sobe a cada 30 s ou ao mexer; espera ficar em dia
    for (let i = 0; i < 40 && (await sync.getAttribute('data-state')) !== 'ok'; i++) await page.waitForTimeout(1500)

    const userId = sql(`select id from auth.users where email = ${lit(email)}`)
    const couple = sql(`select couple_id from couple_members where user_id = ${lit(userId)}`)
    let ideas = 0
    for (let i = 0; i < 20 && ideas === 0; i++) {
      ideas = Number(sql(`select count(*) from ideas where couple_id = ${lit(couple)} and owner_id = 'A' and not deleted`))
      if (!ideas) await page.waitForTimeout(1500)
    }
    const captures = Number(sql(`select count(*) from idea_captures where couple_id = ${lit(couple)}`))
    const logs = sql(`select provider || ' / ' || model from idea_ai_log where couple_id = ${lit(couple)} limit 1`)
    const titles = sql(`select string_agg(title, ' | ') from ideas where couple_id = ${lit(couple)}`)
    console.log(`no Postgres: ${ideas} ideias (${titles}), ${captures} captura, registro da IA: ${logs}`)
    assert.ok(ideas >= 1, 'ideias subiram para a nuvem')
    assert.strictEqual(captures, 1)
    assert.match(logs, /^claude-assinatura \/ claude/)
    assert.deepStrictEqual(errors, [])
    console.log('LIVE NUVEM OK')
  } catch (e) {
    console.error('LIVE NUVEM FALHOU:', e.message, errors)
    process.exitCode = 1
  } finally {
    await app.close()
  }
})()
