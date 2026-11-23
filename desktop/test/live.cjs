// Teste REAL do Ampara no PC: abre o exe, cria um espaço local de teste (senha gerada aqui, nada real),
// solta um pensamento e espera a IA da assinatura organizar. Usa um pouco do limite da assinatura.
// Rode na raiz:  npm run build  e depois  cd desktop && npm run test:live
const { _electron: electron } = require('playwright-core')
const assert = require('assert')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const OUT = process.env.AMPARA_SHOTS || path.join(os.tmpdir(), 'ampara-desktop-shots')

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ampara-desktop-'))
  const app = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, AMPARA_USER_DATA: userData, AMPARA_DIST: process.env.AMPARA_DIST || path.join(__dirname, '..', '..', 'dist') },
  })
  const errors = []
  try {
    // a bolinha também é uma janela: o app é a que carrega app://ampara
    let page = null
    for (let i = 0; i < 50 && !page; i++) {
      page = app.windows().find((w) => w.url().startsWith('app://ampara')) ?? null
      if (!page) await new Promise((r) => setTimeout(r, 200))
    }
    if (!page) throw new Error('janela do app não apareceu')
    page.on('pageerror', (e) => errors.push(String(e)))
    page.setDefaultTimeout(20000)
    await page.waitForSelector('[data-testid="setup-form"], [data-testid="app"]')
    assert.strictEqual(await page.evaluate(() => typeof window.amparaDesktop?.runStructured), 'function', 'ponte do PC presente')

    // espaço local de teste (nenhum dado real)
    const password = `teste-${crypto.randomBytes(6).toString('hex')}`
    await page.evaluate(() => ['A', 'B'].forEach((p) => localStorage.setItem(`ampara:tour:${p}`, 'done')))
    await page.getByTestId('setup-name').fill('Teste')
    await page.getByTestId('setup-password').fill(password)
    await page.getByTestId('setup-password2').fill(password)
    await page.getByTestId('setup-partner').fill('Par de teste')
    await page.getByTestId('setup-submit').click()
    await page.getByTestId('welcome-enter').click()
    await page.waitForSelector('[data-testid="app"]')

    await page.locator('[data-testid="side-ideias"]:visible, [data-testid="nav-ideias"]:visible').first().click()
    await page.getByTestId('ideas-screen').waitFor()
    assert.match(await page.getByTestId('idea-capture').textContent(), /A IA do PC organiza/)
    console.log('provedor em uso:', await page.evaluate(() => localStorage.getItem('ampara:ai') || 'auto'))

    const t0 = Date.now()
    await page.getByTestId('idea-capture-input').fill('quero voltar a correr de manhã, mas tenho medo de não conseguir acordar cedo. talvez dormir antes das 23h ajude')
    await page.getByTestId('idea-capture-save').click()
    await page.getByTestId('idea-organizing').waitFor()
    const toast = page.getByText(/^Organizei|A IA não teve certeza|Ficou na Caixa de entrada\.$/).first()
    await page.waitForFunction(() => !document.querySelector('[data-testid="idea-organizing"]'), null, { timeout: 180000 })
    console.log(`IA respondeu em ${Math.round((Date.now() - t0) / 1000)} s:`, await toast.textContent())
    await page.screenshot({ path: path.join(OUT, '01-depois-da-ia.png') })

    await page.getByTestId('ideas-view-esboco').click()
    const rows = page.locator('[data-testid^="idea-row-"]')
    const count = await rows.count()
    console.log('ideias criadas:', count, '·', (await rows.allTextContents()).map((t) => t.slice(0, 60)).join(' | '))
    assert.ok(count >= 1, 'a IA criou pelo menos uma ideia')
    await page.screenshot({ path: path.join(OUT, '02-esboco.png'), fullPage: true })

    await page.getByTestId('ideas-view-mapa').click()
    const areaNode = page.locator('[data-testid^="map-node-A:"]').filter({ hasNot: page.locator('[stroke-dasharray]') }).first()
    await areaNode.click()
    await page.screenshot({ path: path.join(OUT, '03-mapa.png') })

    assert.deepStrictEqual(errors, [], 'sem erros na página')
    console.log('LIVE OK · prints em', OUT)
  } catch (e) {
    console.error('LIVE FALHOU:', e.message, errors)
    process.exitCode = 1
  } finally {
    await app.close()
  }
})()
