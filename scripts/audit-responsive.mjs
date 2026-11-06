// Auditoria de responsividade: menus cortados, botões estourando e capturas por tela.
// Uso: npm run dev (em outro terminal) e node scripts/audit-responsive.mjs [pasta-de-saida]
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const out = process.argv[2] ?? 'test-results/responsive'
mkdirSync(out, { recursive: true })
const BASE = 'http://localhost:5173'
const browser = await chromium.launch({ channel: 'msedge' })

for (const w of [360, 390]) {
  const p = await browser.newPage({ viewport: { width: w, height: 800 } })
  await p.goto(`${BASE}/`)
  await p.getByTestId('setup-form').waitFor()
  await p.screenshot({ path: `${out}/${w}-00-cadastro.png`, fullPage: true })
  await p.getByTestId('setup-name').fill('Lucas')
  await p.getByTestId('setup-password').fill('cafe com pao na varanda')
  await p.getByTestId('setup-password2').fill('cafe com pao na varanda')
  await p.getByTestId('setup-partner').fill('Namorada')
  await p.getByTestId('setup-submit').click()
  await p.getByTestId('welcome-enter').waitFor()
  await p.screenshot({ path: `${out}/${w}-00-convite.png` })
  await p.getByTestId('welcome-enter').click()
  await p.getByTestId('app').waitFor()

  const report = []
  for (const tab of ['hoje', 'agenda', 'rotinas', 'financas', 'ajustes']) {
    await p.evaluate((t) => (location.hash = '#/' + t), tab)
    await p.waitForTimeout(300)
    const views = tab === 'agenda' ? ['agenda-DAY', 'agenda-WEEK', 'agenda-MONTH', 'agenda-INBOX'] : tab === 'financas' ? ['fin-US', 'fin-MINE', 'fin-PARTNER'] : [null]
    for (const v of views) {
      if (v) await p.getByTestId(v).click()
      await p.waitForTimeout(200)
      const issues = await p.evaluate(() => {
        const r = []
        document.querySelectorAll('[role=radiogroup]').forEach((g) => {
          if (g.getBoundingClientRect().width && g.scrollWidth > g.clientWidth + 1) r.push(`menu cortado: "${g.textContent.slice(0, 60)}"`)
          g.querySelectorAll('[role=radio] span').forEach((s) => {
            if (s.getBoundingClientRect().width && s.scrollWidth > s.clientWidth + 1) r.push(`opção truncada: "${s.textContent}"`)
          })
        })
        document.querySelectorAll('button').forEach((b) => {
          if (b.getBoundingClientRect().width && b.scrollWidth > b.clientWidth + 1) r.push(`botão estourando: "${b.textContent.slice(0, 40)}"`)
        })
        if (document.documentElement.scrollWidth > innerWidth) r.push('overflow horizontal')
        return [...new Set(r)]
      })
      report.push(`[${w}] ${tab}${v ? '/' + v : ''}: ${issues.length ? '\n   ' + issues.join('\n   ') : 'ok'}`)
      await p.screenshot({ path: `${out}/${w}-${tab}${v ? '-' + v : ''}.png`, fullPage: true })
    }
  }
  for (const k of ['task', 'expense', 'med', 'sos']) {
    await p.goto(`${BASE}/?quick=${k}`)
    await p.getByTestId(`sheet-${k}`).waitFor()
    await p.waitForTimeout(400)
    await p.screenshot({ path: `${out}/${w}-sheet-${k}.png` })
  }
  console.log(report.join('\n'))
  await p.close()
}
await browser.close()
