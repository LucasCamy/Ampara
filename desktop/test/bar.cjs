// Teste da barra (sem IA, sem gasto): escondida até o atalho, aparece por cima, Enter guarda como ideia,
// Ctrl+Enter abre uma conversa que fica salva e reabrível, Extrair manda para as Ideias, Esc e clicar fora
// escondem, e a posição fica salva. Rode na raiz:  npm run build  e depois  cd desktop && npm run test:bar
const { _electron: electron } = require('playwright-core')
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const OUT = process.env.AMPARA_SHOTS || path.join(os.tmpdir(), 'ampara-desktop-shots')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ampara-bar-'))
  const launch = () => electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, AMPARA_TEST_HOOKS: '1', AMPARA_USER_DATA: userData, AMPARA_DIST: process.env.AMPARA_DIST || path.join(__dirname, '..', '..', 'dist') },
  })
  let app = await launch()
  try {
    const info = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => ({
      kind: w.webContents.getURL().endsWith('bar.html') ? 'bar' : w.webContents.getURL().startsWith('app://') ? 'app' : 'other',
      visible: w.isVisible(), top: w.isAlwaysOnTop(), bounds: w.getBounds(),
    })))
    const get = async (kind) => (await info()).find((w) => w.kind === kind)
    const until = async (fn, what, tries = 30) => {
      for (let i = 0; i < tries; i++) { const v = await fn(); if (v) return v; await wait(200) }
      throw new Error(`não aconteceu: ${what} ${JSON.stringify(await info())}`)
    }
    const findPage = (pred) => until(() => app.windows().find(pred), 'janela')
    const main = await findPage((x) => x.url().startsWith('app://ampara'))
    await main.waitForSelector('[data-testid="setup-form"]')
    const pw = `teste-${require('crypto').randomBytes(6).toString('hex')}`
    await main.evaluate(() => {
      ['A', 'B'].forEach((p) => localStorage.setItem(`ampara:tour:${p}`, 'done'))
      localStorage.setItem('ampara:ai', 'off') // sem IA: o teste não gasta nada
    })
    await main.getByTestId('setup-name').fill('Teste')
    await main.getByTestId('setup-password').fill(pw)
    await main.getByTestId('setup-password2').fill(pw)
    await main.getByTestId('setup-partner').fill('Par de teste')
    await main.getByTestId('setup-submit').click()
    await main.getByTestId('welcome-enter').click()
    await main.waitForSelector('[data-testid="app"]')

    const barPage = await findPage((x) => x.url().endsWith('bar.html'))
    // 1. escondida até o atalho; sem bolinha
    let bar = await get('bar')
    assert.strictEqual(bar.visible, false, 'a barra começa escondida')
    // com o Ampara (ou o AjudaMental) instalado aberto, o atalho já está ocupado: só avisa
    const shortcut = await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CommandOrControl+Shift+Space'))
    if (!shortcut) console.warn('AVISO: atalho ocupado por outro programa aberto; o teste usa o gancho de teste no lugar dele')
    assert.strictEqual((await info()).length, 2, 'só a janela do app e a barra (nada de bolinha)')

    // 2. o atalho mostra a barra por cima, no tamanho enxuto, com o cursor no campo
    await app.evaluate(() => global.__ampara.toggleBar())
    bar = await until(async () => { const b = await get('bar'); return b.visible && b }, 'barra visível')
    assert.ok(bar.top)
    assert.deepStrictEqual([bar.bounds.width, bar.bounds.height], [496, 72])
    await barPage.waitForFunction(() => document.activeElement?.id === 'text')
    await barPage.screenshot({ path: path.join(OUT, '20-barra.png') })

    // 3. Enter guarda como ideia: painel de 480 abre logo abaixo da barra
    await barPage.fill('#text', 'comprar pilha para o controle')
    await barPage.press('#text', 'Enter')
    const panel = await until(async () => { const w = await get('app'); return w.visible && w.top && w.bounds.width === 480 && w }, 'painel aberto')
    bar = await get('bar')
    assert.ok(panel.bounds.y >= bar.bounds.y + 56, `painel abaixo da barra (${panel.bounds.y} vs ${bar.bounds.y})`)
    assert.ok(panel.bounds.height <= 580)
    await main.getByTestId('compact-saved').waitFor()
    assert.match(await main.getByTestId('compact-saved').innerText(), /Guardado/)
    assert.strictEqual(await barPage.inputValue('#text'), '', 'a barra limpa o campo')
    await main.screenshot({ path: path.join(OUT, '21-painel-soltar.png') })

    // 4. Ctrl+Enter abre uma conversa; sem IA a fala fica guardada e o erro é claro
    await app.evaluate(() => global.__ampara.showBar())
    await barPage.fill('#text', 'preciso organizar a mudança de casa')
    await barPage.press('#text', 'Control+Enter')
    await main.getByTestId('compact-chat').waitFor()
    await main.getByTestId('compact-last').waitFor()
    assert.match(await main.getByTestId('compact-last').innerText(), /mudança de casa/)
    await main.getByRole('alert').first().waitFor()
    await main.screenshot({ path: path.join(OUT, '22-painel-conversa.png') })

    // 5. conversas salvas e reabríveis; Extrair vira captura (sem IA, vai para a Caixa de entrada)
    await main.getByTestId('compact-tab-talks').click()
    assert.strictEqual(await main.getByTestId('compact-talk').count(), 1)
    await main.getByTestId('compact-talk').click()
    await main.getByTestId('compact-last').waitFor()
    await main.getByTestId('compact-extract').click()
    await main.getByTestId('compact-tab-talks').click()
    assert.match(await main.getByTestId('compact-talk').innerText(), /extraída para as Ideias/)
    await main.screenshot({ path: path.join(OUT, '23-painel-conversas.png') })

    // 6. Esc na barra esconde a barra e o painel
    await app.evaluate(() => global.__ampara.showBar())
    await barPage.press('#text', 'Escape')
    await until(async () => !(await get('bar')).visible && !(await get('app')).visible, 'tudo escondido com Esc')

    // 7. a barra de novo; foco em outra janela (clicar fora) esconde
    await app.evaluate(() => global.__ampara.showBar())
    await until(async () => (await get('bar')).visible, 'barra de novo')
    await app.evaluate(({ BrowserWindow }) => {
      const w = new BrowserWindow({ width: 200, height: 200, x: 10, y: 10, show: true, title: 'outra' })
      w.loadURL('data:text/html,<p>fora</p>')
      w.focus()
    })
    await until(async () => !(await get('bar')).visible, 'barra some ao clicar fora', 40)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((x) => x.getTitle() === 'outra').forEach((x) => x.destroy()))

    // 8. "Abrir o Ampara completo" na barra: janela normal, sem ficar por cima, barra escondida
    await app.evaluate(() => global.__ampara.showBar())
    await barPage.click('#full')
    await until(async () => { const w = await get('app'); return w.visible && !w.top && w.bounds.width > 480 && w }, 'janela completa')
    assert.strictEqual((await get('bar')).visible, false)
    await main.screenshot({ path: path.join(OUT, '24-janela-completa.png') })

    // 9. posição da barra fica salva e volta no mesmo lugar
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('bar.html')).setPosition(120, 90))
    await wait(700)
    const saved = JSON.parse(fs.readFileSync(path.join(userData, 'desktop-prefs.json'), 'utf8')).bar
    assert.deepStrictEqual(saved, { x: 120, y: 90 })

    // 10. fechar a janela só esconde; ao reabrir o exe a barra volta escondida e no mesmo lugar
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().startsWith('app://')).close())
    await wait(300)
    assert.strictEqual((await info()).length, 2, 'janela continua existindo (escondida)')
    await app.close()
    app = await launch()
    await app.firstWindow()
    await wait(1500)
    const again = (await info()).find((x) => x.kind === 'bar')
    assert.deepStrictEqual({ x: again.bounds.x, y: again.bounds.y }, saved)
    assert.strictEqual(again.visible, false, 'volta escondida')
    console.log('BARRA OK · prints em', OUT)
  } catch (e) {
    console.error('BARRA FALHOU:', e.message)
    process.exitCode = 1
  } finally {
    await app.close().catch(() => {})
  }
})()
