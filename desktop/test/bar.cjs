// Teste da barra (sem IA, sem gasto): escondida até o atalho, um campo só, a resposta cresce embaixo da barra
// (sem outra janela), Enter guarda como ideia, o modo conversa conversa, conversas ficam salvas e reabríveis,
// Extrair manda para as Ideias, cofre fechado faz o texto esperar, Esc e clicar fora escondem, posição salva.
// Rode na raiz:  cd desktop && npm run app  e depois  npm run test:bar
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
    env: { ...process.env, AMPARA_TEST_HOOKS: '1', AMPARA_USER_DATA: userData, AMPARA_DIST: process.env.AMPARA_DIST || path.join(__dirname, '..', 'app-dist') },
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
    const barPage = await findPage((x) => x.url().endsWith('bar.html'))
    const out = () => barPage.locator('#out')
    await main.waitForSelector('[data-testid="setup-form"]')

    // 1. escondida até o atalho; só a janela do app e a barra
    assert.strictEqual((await get('bar')).visible, false, 'a barra começa escondida')
    const shortcut = await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CommandOrControl+Shift+Space'))
    if (!shortcut) console.warn('AVISO: atalho ocupado por outro programa aberto; o teste usa o gancho de teste no lugar dele')
    assert.strictEqual((await info()).length, 2, 'só a janela do app e a barra')

    // 2. cofre fechado: o texto espera e a barra pede para entrar (nada se perde)
    await app.evaluate(() => global.__ampara.toggleBar())
    let bar = await until(async () => { const b = await get('bar'); return b.visible && b }, 'barra visível')
    assert.ok(bar.top)
    assert.deepStrictEqual([bar.bounds.width, bar.bounds.height], [496, 72])
    await barPage.waitForFunction(() => document.activeElement?.id === 'text')
    await barPage.screenshot({ path: path.join(OUT, '20-barra.png') })
    await barPage.fill('#text', 'comprar pilha para o controle')
    await barPage.press('#text', 'Enter')
    await out().getByText('Entre no Ampara para continuar').waitFor()
    await barPage.screenshot({ path: path.join(OUT, '21-barra-cofre-fechado.png') })

    // entra (espaço de teste, sem IA: não gasta nada); o texto que esperou é guardado sozinho
    const pw = `teste-${require('crypto').randomBytes(6).toString('hex')}`
    await main.evaluate(() => {
      ['A', 'B'].forEach((p) => localStorage.setItem(`ampara:tour:${p}`, 'done'))
      localStorage.setItem('ampara:ai', 'off')
    })
    await main.getByTestId('setup-name').fill('Teste')
    await main.getByTestId('setup-password').fill(pw)
    await main.getByTestId('setup-password2').fill(pw)
    await main.getByTestId('setup-partner').fill('Par de teste')
    await main.getByTestId('setup-submit').click()
    await main.getByTestId('welcome-enter').click()
    await main.waitForSelector('[data-testid="app"]')
    await until(() => app.evaluate(() => global.__ampara.isReady()), 'app pronto para a barra')
    await out().getByText('Guardado na Caixa de entrada').waitFor()
    // o app esconde-se: daqui em diante a barra trabalha sozinha, sem mostrar a janela
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().startsWith('app://')).hide())

    // 3. Enter guarda como ideia: a confirmação aparece embaixo da barra; a janela do app não aparece
    await app.evaluate(() => global.__ampara.showBar())
    await barPage.fill('#text', 'trocar a lâmpada da cozinha')
    await barPage.press('#text', 'Enter')
    assert.strictEqual(await barPage.inputValue('#text'), '', 'a barra limpa o campo')
    await until(async () => (await out().innerText()).includes('Guardado'), 'confirmação na barra')
    assert.strictEqual((await get('app')).visible, false, 'nenhuma outra janela aparece')
    bar = await get('bar')
    assert.ok(bar.bounds.height > 72 && bar.bounds.height < 200, `a barra cresce só o necessário (${bar.bounds.height})`)
    assert.strictEqual(await barPage.locator('textarea').count(), 0, 'um campo só')

    // 4. modo conversa: o mesmo campo conversa; sem IA, a fala fica guardada e o aviso é claro
    await barPage.click('#mode')
    assert.strictEqual(await barPage.getAttribute('#mode', 'aria-pressed'), 'true')
    assert.match(await barPage.getAttribute('#text', 'placeholder'), /Pergunte/)
    await barPage.fill('#text', 'preciso organizar a mudança de casa')
    await barPage.press('#text', 'Enter')
    await out().getByText('preciso organizar a mudança de casa').waitFor()
    await out().getByText('Sem IA neste aparelho').waitFor()
    assert.strictEqual((await get('app')).visible, false, 'a conversa acontece na barra')
    await barPage.screenshot({ path: path.join(OUT, '22-barra-conversa.png') })

    // 5. Conversas: lista e reabre; Extrair manda para as Ideias
    await out().getByRole('button', { name: 'Conversas' }).click()
    await out().locator('.item').first().waitFor()
    assert.strictEqual(await out().locator('.item').count(), 1)
    await barPage.screenshot({ path: path.join(OUT, '23-barra-conversas.png') })
    await out().locator('.item').first().click()
    // abrir uma conversa da lista deixa o cursor no campo: é só continuar escrevendo
    await barPage.waitForFunction(() => document.activeElement?.id === 'text')
    assert.match(await barPage.getAttribute('#text', 'placeholder'), /Continue a conversa/)
    await barPage.keyboard.type('e também separar as caixas')
    await barPage.keyboard.press('Enter')
    await out().getByText('e também separar as caixas').waitFor()
    await out().getByText('preciso organizar a mudança de casa').waitFor()
    await out().getByRole('button', { name: 'Conversas' }).click()
    await out().locator('.item').first().waitFor()
    assert.strictEqual(await out().locator('.item').count(), 1, 'continuou a mesma conversa')
    await out().locator('.item').first().click()
    await out().getByRole('button', { name: 'Extrair' }).click()
    await out().getByRole('button', { name: 'Extraída para as Ideias' }).waitFor()
    const pending = await main.evaluate(() => document.querySelector('[data-testid="ideas-view-caixa"]')?.textContent ?? '')
    assert.match(pending, /\(3\)/, `três pensamentos na Caixa de entrada: ${pending}`)

    // 6. Nova conversa limpa; sair do modo conversa volta a guardar
    await out().getByRole('button', { name: 'Nova conversa' }).click()
    await barPage.click('#mode')
    assert.match(await barPage.getAttribute('#text', 'placeholder'), /cabeça/)

    // 7. Esc esconde
    await barPage.press('#text', 'Escape')
    await until(async () => !(await get('bar')).visible, 'escondida com Esc')

    // 8. clicar fora esconde
    await app.evaluate(() => global.__ampara.showBar())
    await until(async () => (await get('bar')).visible, 'barra de novo')
    await app.evaluate(({ BrowserWindow }) => {
      const w = new BrowserWindow({ width: 200, height: 200, x: 10, y: 10, show: true, title: 'outra' })
      w.loadURL('data:text/html,<p>fora</p>')
      w.focus()
    })
    await until(async () => !(await get('bar')).visible, 'barra some ao clicar fora', 40)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((x) => x.getTitle() === 'outra').forEach((x) => x.destroy()))

    // 9. "Abrir o Ampara completo": janela normal, sem ficar por cima, barra escondida
    await app.evaluate(() => global.__ampara.showBar())
    await barPage.click('#full')
    await until(async () => { const w = await get('app'); return w.visible && !w.top && w.bounds.width > 480 && w }, 'janela completa')
    assert.strictEqual((await get('bar')).visible, false)

    // 10. posição salva; fechar só esconde; ao reabrir o exe a barra volta escondida e no mesmo lugar
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('bar.html')).setPosition(120, 90))
    await wait(700)
    const saved = JSON.parse(fs.readFileSync(path.join(userData, 'desktop-prefs.json'), 'utf8')).bar
    assert.deepStrictEqual(saved, { x: 120, y: 90 })
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
