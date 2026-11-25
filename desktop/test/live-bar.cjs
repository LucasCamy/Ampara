// Teste REAL da barra com a IA local (grátis): espaço de teste (senha gerada aqui, nada real), conversa pela
// própria barra, a resposta aparece embaixo dela, e Extrair leva a conversa para as Ideias, organizada por trás.
// Rode:  cd desktop && npm run app  e depois  node test/live-bar.cjs
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
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ampara-livebar-'))
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

    await app.evaluate(() => global.__ampara.showBar())
    const out = barPage.locator('#out')
    await barPage.click('#mode')
    const t0 = Date.now()
    await barPage.fill('#text', 'estou cansado de procrastinar a reforma do quarto, por onde começo?')
    await barPage.press('#text', 'Enter')
    await out.getByText('Pensando…').waitFor()
    await out.locator('.answer').waitFor({ timeout: 180000 })
    console.log(`resposta em ${Math.round((Date.now() - t0) / 1000)} s:`, (await out.locator('.answer').innerText()).replace(/\s+/g, ' ').slice(0, 240))
    await barPage.screenshot({ path: path.join(OUT, '30-barra-resposta.png') })

    // continua no mesmo campo
    await barPage.fill('#text', 'e se eu tiver só 15 minutos por dia?')
    await barPage.press('#text', 'Enter')
    await out.getByText('Pensando…').waitFor()
    await out.getByText('Pensando…').waitFor({ state: 'detached', timeout: 180000 })
    await out.getByText(/Ver mais \(\d+\)/).waitFor()
    await barPage.screenshot({ path: path.join(OUT, '31-barra-continua.png') })

    await out.getByRole('button', { name: 'Extrair' }).click()
    await out.getByText(/Organizei em|A IA não teve certeza|organizo quando/).waitFor({ timeout: 240000 })
    console.log('extrair:', await out.locator('.note').innerText())
    await barPage.screenshot({ path: path.join(OUT, '32-barra-extraida.png') })
    const visible = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().startsWith('app://')).isVisible())
    assert.strictEqual(visible, false, 'tudo aconteceu na barra')
    console.log('LIVE BARRA OK · prints em', OUT)
  } catch (e) {
    console.error('LIVE BARRA FALHOU:', e.message)
    process.exitCode = 1
  } finally {
    await app.close().catch(() => {})
  }
})()
