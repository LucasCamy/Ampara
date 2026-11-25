// Teste REAL do cérebro por trás (ADR-0012) no app do PC, usando a IA LOCAL (Gemma + sentido no LM Studio).
// Cria um espaço local de teste (senha gerada aqui, nada real), solta 3 pensamentos em sequência sem esperar,
// confere a fila, o palpite pelo sentido e o "Perguntar às ideias" por sentido.
// Rode na raiz:  npm run app (em desktop/)  e depois  cd desktop && node test/live-sentido.cjs
const { _electron: electron } = require('playwright-core')
const assert = require('assert')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const OUT = process.env.AMPARA_SHOTS || path.join(os.tmpdir(), 'ampara-desktop-shots')
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ampara-desktop-'))
  const app = await electron.launch({ args: [path.join(__dirname, '..')], env: { ...process.env, AMPARA_USER_DATA: userData } })
  const errors = []
  try {
    let page = null
    for (let i = 0; i < 50 && !page; i++) {
      page = app.windows().find((w) => w.url().startsWith('app://ampara')) ?? null
      if (!page) await new Promise((r) => setTimeout(r, 200))
    }
    if (!page) throw new Error('janela do app não apareceu')
    page.on('pageerror', (e) => errors.push(String(e)))
    page.setDefaultTimeout(20000)
    await page.waitForSelector('[data-testid="setup-form"], [data-testid="app"]')

    const password = `teste-${crypto.randomBytes(6).toString('hex')}`
    // só a IA local (para ter certeza de que é ela quem organiza)
    await page.evaluate(() => {
      ;['A', 'B'].forEach((p) => localStorage.setItem(`ampara:tour:${p}`, 'done'))
      localStorage.setItem('ampara:ai', 'local')
      localStorage.setItem('ampara:ai:A', 'local')
    })
    await page.getByTestId('setup-name').fill('Teste')
    await page.getByTestId('setup-password').fill(password)
    await page.getByTestId('setup-password2').fill(password)
    await page.getByTestId('setup-partner').fill('Par de teste')
    await page.getByTestId('setup-submit').click()
    await page.getByTestId('welcome-enter').click()
    await page.waitForSelector('[data-testid="app"]')
    await page.locator('[data-testid="side-ideias"]:visible, [data-testid="nav-ideias"]:visible').first().click()
    await page.getByTestId('ideas-screen').waitFor()

    // 1) três pensamentos seguidos, sem esperar a IA
    const thoughts = [
      'quero voltar a correr três vezes por semana de manhã',
      'as mudas de manjericão da varanda secaram de novo',
      'e comprar um tênis melhor pra isso',
    ]
    const t0 = Date.now()
    const input = page.getByTestId('idea-capture-input')
    for (const t of thoughts) {
      await input.fill(t)
      await page.getByTestId('idea-capture-save').click()
      assert.strictEqual(await input.inputValue(), '', 'o campo fica livre na hora')
    }
    console.log(`3 pensamentos soltos em ${Date.now() - t0} ms`)
    await page.getByTestId('idea-organizing').filter({ hasText: 'organizando por trás' }).waitFor()
    console.log('fila:', await page.getByTestId('idea-organizing').textContent())
    await shot(page, 's01-fila.png')
    await page.waitForFunction(() => !document.querySelector('[data-testid="idea-organizing"]')?.textContent?.includes('organizando por trás'), null, { timeout: 300000 })
    console.log(`fila vazia em ${Math.round((Date.now() - t0) / 1000)} s`)

    await page.getByTestId('ideas-view-esboco').click()
    const rows = page.locator('[data-testid^="idea-row-"]')
    console.log('ideias:', (await rows.allTextContents()).map((t) => t.slice(0, 70)).join(' | '))
    assert.ok(await rows.count() >= 2, 'a IA criou ideias')
    await shot(page, 's02-esboco.png')

    // 2) palpite pelo sentido, sem palavra em comum com "correr"
    await page.getByTestId('ideas-view-caixa').click().catch(() => {})
    await input.fill('hoje fui trotar na praça uns vinte minutos')
    const t1 = Date.now()
    await page.getByTestId('idea-capture-save').click()
    await page.getByTestId('idea-saved').filter({ hasText: 'Parece ser de' }).waitFor({ timeout: 15000 })
    console.log(`palpite em ${Date.now() - t1} ms:`, await page.getByTestId('idea-saved').textContent())
    await shot(page, 's03-palpite.png')
    await page.waitForFunction(() => !document.querySelector('[data-testid="idea-organizing"]')?.textContent?.includes('organizando por trás'), null, { timeout: 180000 })

    // 3) perguntar por sentido: "exercício" não aparece em nenhum texto
    await page.getByTestId('ideas-ask').click()
    await page.getByTestId('ask-input').fill('o que eu pensei sobre exercício?')
    await page.getByTestId('ask-form').evaluate((f) => f.requestSubmit())
    await page.getByTestId('ask-found').waitFor({ timeout: 120000 })
    const found = await page.getByTestId('ask-found').locator('li').allTextContents()
    console.log('achou:', found.map((t) => t.slice(0, 60)).join(' | '))
    assert.ok(found.some((t) => /corr|trot/i.test(t)), 'achou a corrida pelo sentido')
    await page.getByTestId('ask-answer').waitFor({ timeout: 180000 }).catch(() => {})
    console.log('resposta:', (await page.getByTestId('ask-answer').textContent().catch(() => '(sem resposta)')).slice(0, 300))
    await shot(page, 's04-perguntar.png')

    assert.deepStrictEqual(errors, [], 'sem erros na página')
    console.log('LIVE SENTIDO OK · prints em', OUT)
  } catch (e) {
    console.error('LIVE SENTIDO FALHOU:', e.message, errors)
    process.exitCode = 1
  } finally {
    await app.close()
  }
})()
