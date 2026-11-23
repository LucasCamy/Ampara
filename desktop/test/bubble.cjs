// Teste da bolinha (sem IA, sem gasto): aparece por cima, abre e fecha o painel compacto, arrasta e lembra
// a posição, e fechar a janela só esconde. Rode na raiz:  npm run build  e depois  cd desktop && npm run test:bubble
const { _electron: electron } = require('playwright-core')
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const OUT = process.env.AMPARA_SHOTS || path.join(os.tmpdir(), 'ampara-desktop-shots')

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ampara-bubble-'))
  const launch = () => electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, AMPARA_USER_DATA: userData, AMPARA_DIST: process.env.AMPARA_DIST || path.join(__dirname, '..', '..', 'dist') },
  })
  let app = await launch()
  try {
    const info = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => ({
      title: w.webContents.getURL().endsWith('bubble.html') ? 'Ampara (bolinha)' : 'Ampara', visible: w.isVisible(), top: w.isAlwaysOnTop(), bounds: w.getBounds(), focusable: w.isFocusable(),
    })))
    const byTitle = async (t) => (await info()).find((w) => w.title === t)
    const mainWindow = async () => {
      for (let i = 0; i < 50; i++) {
        const m = app.windows().find((x) => x.url().startsWith('app://ampara'))
        if (m) return m
        await new Promise((r) => setTimeout(r, 200))
      }
      throw new Error('janela principal não apareceu')
    }
    const main = await mainWindow()
    await main.waitForSelector('[data-testid="setup-form"]')
    // espaço local de teste (senha gerada aqui)
    const pw = `teste-${require('crypto').randomBytes(6).toString('hex')}`
    await main.evaluate(() => ['A', 'B'].forEach((p) => localStorage.setItem(`ampara:tour:${p}`, 'done')))
    await main.getByTestId('setup-name').fill('Teste')
    await main.getByTestId('setup-password').fill(pw)
    await main.getByTestId('setup-password2').fill(pw)
    await main.getByTestId('setup-partner').fill('Par de teste')
    await main.getByTestId('setup-submit').click()
    await main.getByTestId('welcome-enter').click()
    await main.waitForSelector('[data-testid="app"]')
    // a bolinha é a janela que carrega bubble.html
    let bubblePage = app.windows().find((w) => w.url().endsWith('bubble.html'))
    for (let i = 0; !bubblePage && i < 20; i++) { await new Promise((r) => setTimeout(r, 200)); bubblePage = app.windows().find((w) => w.url().endsWith('bubble.html')) }
    assert.ok(bubblePage, 'janela da bolinha existe')
    await new Promise((r) => setTimeout(r, 500))

    let b = await byTitle('Ampara (bolinha)')
    assert.ok(b.visible && b.top, 'bolinha visível e por cima')
    assert.deepStrictEqual([b.bounds.width, b.bounds.height], [76, 76])
    assert.strictEqual(b.focusable, false, 'bolinha não rouba o foco')

    // clique: painel compacto perto da bolinha, por cima
    await bubblePage.click('#bubble')
    let w
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 200))
      w = await byTitle('Ampara')
      if (w.visible && w.top && w.bounds.width === 440) break
    }
    assert.ok(w.visible && w.top, `painel aberto e por cima ${JSON.stringify(await info())}`)
    assert.strictEqual(w.bounds.width, 440)
    // painel: só o campo para soltar, com o cursor nele; nada de abas nem Dock
    await main.getByTestId('compact-capture').waitFor()
    assert.strictEqual(await main.locator('[data-testid="nav-ideias"]:visible, [data-testid^="dock-"]:visible').count(), 0)
    await main.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'idea-capture-input')
    await main.screenshot({ path: path.join(OUT, '10-painel-compacto.png') })

    // "Abrir o Ampara completo": janela normal, sem ficar por cima
    await main.getByTestId('compact-open-full').click()
    await main.locator('[data-testid="compact-capture"]').waitFor({ state: 'detached' })
    w = await byTitle('Ampara')
    assert.ok(w.visible && !w.top && w.bounds.width > 440, `janela completa ${JSON.stringify(w)}`)
    await main.screenshot({ path: path.join(OUT, '11-janela-completa.png') })

    // bolinha de novo: painel; e mais uma vez: esconde
    await bubblePage.click('#bubble')
    await main.getByTestId('compact-capture').waitFor()

    // clique de novo: esconde
    await bubblePage.click('#bubble')
    await new Promise((r) => setTimeout(r, 400))
    w = await byTitle('Ampara')
    assert.strictEqual(w.visible, false, 'painel escondido')

    // arrastar a bolinha move e guarda a posição
    const before = (await byTitle('Ampara (bolinha)')).bounds
    const box = await bubblePage.locator('#bubble').boundingBox()
    await bubblePage.mouse.move(box.x + 30, box.y + 30)
    await bubblePage.mouse.down()
    await bubblePage.mouse.move(box.x + 30 - 120, box.y + 30 - 80, { steps: 8 })
    await bubblePage.mouse.up()
    await new Promise((r) => setTimeout(r, 300))
    const after = (await byTitle('Ampara (bolinha)')).bounds
    assert.ok(after.x < before.x - 40 && after.y < before.y - 30, `bolinha moveu (${before.x},${before.y} -> ${after.x},${after.y})`)
    assert.strictEqual((await byTitle('Ampara')).visible, false, 'arrastar não abre o painel')
    const saved = JSON.parse(fs.readFileSync(path.join(userData, 'desktop-prefs.json'), 'utf8')).bubble
    assert.deepStrictEqual(saved, { x: after.x, y: after.y })

    // fechar a janela só esconde; o app continua com a bolinha
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().startsWith('app://')).close())
    await new Promise((r) => setTimeout(r, 300))
    assert.strictEqual((await info()).length, 2, 'janela continua existindo (escondida)')
    await app.close()

    // ao abrir de novo, a bolinha volta no mesmo lugar
    app = await launch()
    await app.firstWindow()
    await new Promise((r) => setTimeout(r, 1200))
    const again = (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((x) => ({ u: x.webContents.getURL(), b: x.getBounds() })))).find((x) => x.u.endsWith('bubble.html'))
    assert.deepStrictEqual({ x: again.b.x, y: again.b.y }, saved)
    console.log('BOLINHA OK · prints em', OUT)
  } catch (e) {
    console.error('BOLINHA FALHOU:', e.message)
    process.exitCode = 1
  } finally {
    await app.close().catch(() => {})
  }
})()
