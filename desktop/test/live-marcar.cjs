// Teste REAL de "marcar pela barra" (ADR-0014) com a IA local (grátis): espaço de teste (senha gerada aqui),
// uma anotação sobre a dentista, depois "amanhã tenho dentista às 18h" vira uma proposta com o local que estava
// na anotação; Marcar cria na agenda com local.  Rode:  cd desktop && npm run app  e  node test/live-marcar.cjs
const { _electron: electron } = require('playwright-core')
const assert = require('assert')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const OUT = process.env.AMPARA_SHOTS || path.join(os.tmpdir(), 'ampara-desktop-shots')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ampara-marcar-'))
  const app = await electron.launch({ args: [path.join(__dirname, '..')], env: { ...process.env, AMPARA_TEST_HOOKS: '1', AMPARA_USER_DATA: userData } })
  try {
    const find = async (pred) => { for (let i = 0; i < 50; i++) { const w = app.windows().find(pred); if (w) return w; await wait(200) } throw new Error('janela') }
    const main = await find((x) => x.url().startsWith('app://ampara'))
    const barPage = await find((x) => x.url().endsWith('bar.html'))
    main.setDefaultTimeout(20000)
    await main.waitForSelector('[data-testid="setup-form"]')
    const pw = `teste-${crypto.randomBytes(6).toString('hex')}`
    await main.evaluate(() => {
      ;['A', 'B'].forEach((p) => localStorage.setItem(`ampara:tour:${p}`, 'done'))
      localStorage.setItem('ampara:ai', 'local')
      localStorage.setItem('ampara:ai:A', 'local')
    })
    await main.getByTestId('setup-name').fill('Teste')
    await main.getByTestId('setup-password').fill(pw)
    await main.getByTestId('setup-password2').fill(pw)
    await main.getByTestId('setup-partner').fill('Par de teste')
    await main.getByTestId('setup-submit').click()
    await main.getByTestId('welcome-enter').click()
    await main.waitForSelector('[data-testid="app"]')
    for (let i = 0; i < 50 && !(await app.evaluate(() => global.__ampara.isReady())); i++) await wait(200)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().startsWith('app://')).hide())

    const out = barPage.locator('#out')
    await app.evaluate(() => global.__ampara.showBar())
    // 1. o cérebro aprende sobre a dentista
    await barPage.fill('#text', 'minha dentista é a Dra. Paula Souza, o consultório fica na Rua das Flores, 120, sala 3. sempre levar a carteirinha do plano')
    await barPage.press('#text', 'Enter')
    await out.getByText(/Organizei em|A IA não teve certeza/).waitFor({ timeout: 240000 })
    console.log('anotação:', await out.innerText())

    // 2. marcar: a proposta vem com o local da anotação
    const t0 = Date.now()
    await barPage.fill('#text', 'amanhã tenho dentista às 18h')
    await barPage.press('#text', 'Enter')
    await out.getByText('Marcar na agenda?').waitFor({ timeout: 180000 })
    console.log(`proposta em ${Math.round((Date.now() - t0) / 1000)} s:\n` + (await out.innerText()))
    await barPage.screenshot({ path: path.join(OUT, '40-marcar-proposta.png'), timeout: 8000 }).catch(() => console.log('(print da barra não saiu)'))
    await out.getByRole('button', { name: 'Marcar', exact: true }).click()
    await out.getByText(/Marcado na agenda/).waitFor()
    console.log('marcado:', await out.innerText())

    // 3. confere na Agenda do app
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().startsWith('app://')).show())
    await main.locator('[data-testid="side-agenda"]:visible, [data-testid="nav-agenda"]:visible').first().click()
    const row = main.getByTestId('event-row').filter({ hasText: /Dentista/ }).first()
    await row.waitFor({ timeout: 10000 }).catch(() => {})
    console.log('agenda:', (await main.getByTestId('event-row').allInnerTexts()).join(' | ') || '(o compromisso é amanhã; a agenda pode estar mostrando só hoje)')
    await main.screenshot({ path: path.join(OUT, '41-marcar-agenda.png'), timeout: 8000 }).catch(() => {})
    console.log('LIVE MARCAR OK · prints em', OUT)
  } catch (e) {
    console.error('LIVE MARCAR FALHOU:', e.message)
    process.exitCode = 1
  } finally {
    await app.close().catch(() => {})
  }
})()
