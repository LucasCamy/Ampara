// Auditoria de responsividade: menus cortados, cards estourando, alvos pequenos, rodapé de gaveta e capturas.
// Uso: npm run dev (em outro terminal) e node scripts/audit-responsive.mjs [pasta-de-saida]
// AUDIT_URL muda o endereço (padrão http://localhost:5173). Sai com código 1 se achar problema.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const out = process.argv[2] ?? 'test-results/responsive'
mkdirSync(out, { recursive: true })
const BASE = process.env.AUDIT_URL ?? 'http://localhost:5173'
const WIDTHS = [360, 390, 1024, 1280]
const browser = await chromium.launch({ channel: 'msedge' })
let problems = 0

/** Roda no navegador: devolve a lista de problemas visíveis na tela atual */
const inspect = () => {
  const r = []
  const visible = (el) => {
    const b = el.getBoundingClientRect()
    // sr-only (ex.: link "Pular para o conteúdo", que só aparece no foco) tem 1px de propósito
    return b.width > 1 && b.height > 1 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.sr-only')
  }
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.dataset.testid || el.tagName).trim().slice(0, 40)
  document.querySelectorAll('[role=radiogroup]').forEach((g) => {
    if (visible(g) && g.scrollWidth > g.clientWidth + 1) r.push(`menu cortado: "${g.textContent.slice(0, 60)}"`)
    g.querySelectorAll('[role=radio] span').forEach((s) => {
      if (visible(s) && s.scrollWidth > s.clientWidth + 1) r.push(`opção truncada: "${s.textContent}"`)
    })
  })
  document.querySelectorAll('button').forEach((b) => {
    if (visible(b) && b.scrollWidth > b.clientWidth + 1) r.push(`botão estourando: "${name(b)}"`)
  })
  // cards e itens de lista: conteúdo não pode passar da borda
  document.querySelectorAll('.card, .module, [data-testid=week-day], li').forEach((c) => {
    const st = getComputedStyle(c)
    if (!visible(c) || st.overflowX === 'auto' || st.overflowX === 'scroll') return
    if (c.scrollWidth > c.clientWidth + 1) r.push(`card estourando (${c.scrollWidth}>${c.clientWidth}): "${name(c)}"`)
  })
  // alvos de toque: 48px em campos/ações primárias, nunca abaixo de 44px
  document.querySelectorAll('button, [role=radio], [role=switch], a[href], input:not([type=checkbox]):not([type=radio]), select, textarea').forEach((el) => {
    if (!visible(el) || el.closest('[aria-hidden=true]')) return
    const b = el.getBoundingClientRect()
    if (b.height < 43.5) r.push(`alvo de ${Math.round(b.height)}px: "${name(el)}"`)
  })
  // botão de salvar da gaveta fora da área de rolagem (senão o conteúdo vaza por baixo)
  document.querySelectorAll('[role=dialog] [data-testid$="-save"]').forEach((btn) => {
    for (let p = btn.parentElement; p && p.getAttribute('role') !== 'dialog'; p = p.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) r.push(`salvar dentro da rolagem: "${name(btn)}"`)
    }
  })
  if (document.documentElement.scrollWidth > innerWidth) r.push('overflow horizontal')
  return [...new Set(r)]
}

for (const w of WIDTHS) {
  const p = await browser.newPage({ viewport: { width: w, height: w < 768 ? 800 : 900 } })
  const report = []
  const check = async (label, shotName) => {
    await p.waitForTimeout(250)
    const issues = await p.evaluate(inspect)
    problems += issues.length
    report.push(`[${w}] ${label}: ${issues.length ? '\n   ' + issues.join('\n   ') : 'ok'}`)
    await p.screenshot({ path: `${out}/${w}-${shotName}.png`, fullPage: !shotName.startsWith('sheet') })
  }

  await p.goto(`${BASE}/`)
  await p.getByTestId('setup-form').waitFor()
  await p.getByTestId('setup-name').fill('Lucas')
  await p.getByTestId('setup-password').fill('cafe com pao na varanda')
  await p.getByTestId('setup-password2').fill('cafe com pao na varanda')
  await p.getByTestId('setup-partner').fill('Namorada')
  await p.getByTestId('setup-submit').click()
  await p.getByTestId('welcome-enter').click()
  await p.getByTestId('app').waitFor()

  for (const scheme of ['light', 'dark']) {
    // tema pelo próprio botão do app: o uiStore regrava data-theme a cada mudança
    if ((await p.evaluate(() => document.documentElement.dataset.theme)) !== scheme) await p.locator('[data-testid="theme-toggle"]:visible').first().click()
    if ((await p.evaluate(() => document.documentElement.dataset.theme)) !== scheme) report.push(`[${w}] não consegui trocar para o tema ${scheme}`)
    for (const tab of ['hoje', 'agenda', 'nos', 'rotinas', 'financas', 'ajustes']) {
      await p.evaluate((t) => (location.hash = '#/' + t), tab)
      const views = tab === 'agenda' ? ['agenda-DAY', 'agenda-WEEK', 'agenda-MONTH', 'agenda-INBOX'] : tab === 'financas' ? ['fin-US', 'fin-MINE', 'fin-PARTNER'] : [null]
      for (const v of views) {
        if (v) await p.getByTestId(v).click()
        await check(`${scheme} ${tab}${v ? '/' + v : ''}`, `${scheme}-${tab}${v ? '-' + v : ''}`)
      }
    }
  }

  // gavetas: atalhos testados sem recarregar (a sessão continua aberta) e os cadastros novos
  const sheet = async (open, kind) => {
    await open()
    await p.getByTestId(`sheet-${kind}`).waitFor()
    await p.waitForTimeout(350)
    await check(`gaveta ${kind}`, `sheet-${kind}`)
    await p.keyboard.press('Escape')
    await p.getByTestId(`sheet-${kind}`).waitFor({ state: 'detached' })
  }
  for (const k of ['task', 'expense', 'med', 'sos']) {
    await p.evaluate(() => (location.hash = '#/ajustes'))
    await sheet(() => p.getByTestId(`try-${k}`).click(), k)
    if (!(await p.getByTestId('app').isVisible())) report.push(`[${w}] atalho ${k}: a sessão caiu`)
  }
  await p.evaluate(() => (location.hash = '#/rotinas'))
  await sheet(() => p.getByTestId('add-med').click(), 'newMed')
  await sheet(() => p.getByTestId('add-routine').click(), 'routine')
  await p.evaluate(() => (location.hash = '#/agenda'))
  await sheet(() => p.getByTestId('agenda-new-event').click(), 'event')

  console.log(report.join('\n'))
  await p.close()
}
await browser.close()
console.log(problems ? `\n${problems} problema(s) encontrado(s)` : '\nNenhum problema encontrado')
process.exit(problems ? 1 : 0)
