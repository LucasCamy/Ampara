// Auditoria Solo com leitura ampla: use AUDIT_URL para apontar para um Vite já aberto.
// AUDIT_WIDTHS, AUDIT_FONTS e AUDIT_SCHEMES aceitam listas separadas por vírgula para uma repetição focada.
// AUDIT_RESUME=1 repete só combinações ausentes ou com falha e consolida os resultados já verificados.
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const base = process.env.AUDIT_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'test-results/solo-responsive'
const widths = (process.env.AUDIT_WIDTHS ?? '360,390').split(',').map(Number)
const fonts = (process.env.AUDIT_FONTS ?? 'lexend,atkinson').split(',')
const schemes = (process.env.AUDIT_SCHEMES ?? 'light,dark').split(',')
mkdirSync(out, { recursive: true })
const resume = process.env.AUDIT_RESUME === '1'
let previous = []
if (resume) {
  try { previous = JSON.parse(readFileSync(`${out}/report.json`, 'utf8')) } catch { /* primeira execução */ }
}
const requested = widths.flatMap((width) => fonts.flatMap((font) => schemes.map((scheme) => `${width}-${font}-${scheme}`)))
const toRun = new Set(requested.filter((context) => !resume || !previous.some((entry) => entry.context === context) || previous.some((entry) => entry.context === context && entry.issues.length)))
const browser = await chromium.launch({ channel: 'msedge' })
const report = resume ? previous.filter((entry) => !toRun.has(entry.context)) : []
if (resume) console.log(`Repetindo ${toRun.size} de ${requested.length} combinações; os outros resultados verificados permanecem no relatório.`)
const password = 'cafe com pao na varanda'
const taskTitle = 'Organizar documentos importantes sem precisar resolver tudo de uma vez'

const inspect = () => {
  const findings = []
  const scope = document.querySelector('[role=dialog][aria-modal=true]') ?? document
  const visible = (element) => {
    const box = element.getBoundingClientRect()
    return box.width > 1 && box.height > 1 && getComputedStyle(element).visibility !== 'hidden' && !element.closest('.sr-only, [aria-hidden=true], [inert]')
  }
  const name = (element) => (element.getAttribute('aria-label') || element.textContent || element.dataset.testid || element.tagName).trim().replace(/\s+/g, ' ').slice(0, 85)
  scope.querySelectorAll('[role=radiogroup]').forEach((group) => {
    if (visible(group) && group.scrollWidth > group.clientWidth + 1) findings.push(`menu cortado: ${name(group)}`)
    group.querySelectorAll('[role=radio] span').forEach((span) => {
      if (visible(span) && span.scrollWidth > span.clientWidth + 1) findings.push(`opção truncada: ${name(span)}`)
    })
  })
  scope.querySelectorAll('button, .card, .module, [data-testid=week-day], [data-testid=template-card], li').forEach((element) => {
    const style = getComputedStyle(element)
    if (visible(element) && !['auto', 'scroll'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1) findings.push(`conteúdo estourando (${element.scrollWidth}>${element.clientWidth}): ${name(element)}`)
  })
  scope.querySelectorAll('button, [role=radio], [role=switch], a[href], input:not([type=checkbox]):not([type=radio]), select, textarea').forEach((element) => {
    if (!visible(element)) return
    const minimum = element.classList.contains('btn-primary') || element.matches('input, textarea, select') ? 48 : 44
    if (element.getBoundingClientRect().height < minimum - 0.5) findings.push(`alvo abaixo de ${minimum}px: ${name(element)}`)
    if (element.matches('input, textarea, select') && parseFloat(getComputedStyle(element).fontSize) < 16) findings.push(`campo menor que 16px: ${name(element)}`)
  })
  scope.querySelectorAll('[data-testid$="-save"], [data-testid=unstuck-next], [data-testid=unstuck-start]').forEach((button) => {
    if (!visible(button) || !button.closest('[role=dialog]')) return
    for (let parent = button.parentElement; parent && parent.getAttribute('role') !== 'dialog'; parent = parent.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) findings.push(`salvar dentro da rolagem: ${name(button)}`)
    }
    const box = button.getBoundingClientRect()
    if (box.bottom > innerHeight + 1 || box.left < -1 || box.right > innerWidth + 1) findings.push(`rodapé fora da janela: ${name(button)}`)
  })
  if (document.documentElement.scrollWidth > innerWidth + 1) findings.push('overflow horizontal da página')
  return [...new Set(findings)]
}

try {
  for (const width of widths) for (const font of fonts) for (const scheme of schemes) {
    const prefix = `${width}-${font}-${scheme}`
    if (!toRun.has(prefix)) continue
    // O relógio controlado e movimento reduzido deixam as capturas medir o layout final da gaveta.
    const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: scheme, reducedMotion: 'reduce', locale: 'pt-BR', timezoneId: 'America/Cuiaba', hasTouch: true })
    const page = await context.newPage()
    const byId = (id) => page.locator(`[data-testid="${id}"]:not([aria-hidden=true] *):not([inert] *)`)
    page.on('pageerror', (error) => report.push({ context: prefix, screen: 'javascript', issues: [String(error)] }))
    const check = async (screen) => {
      await page.clock.runFor(100)
      await dismissToasts()
      await page.evaluate(() => document.fonts.ready)
      const issues = await page.evaluate(inspect)
      report.push({ context: prefix, screen, issues })
      console.log(`[${prefix}] ${screen}: ${issues.length ? issues.join(' | ') : 'ok'}`)
      await page.screenshot({ path: `${out}/${prefix}-${screen}.png`, fullPage: !screen.startsWith('sheet-') })
    }
    const visible = (id) => page.locator(`[data-testid="${id}"]:visible`).first()
    const go = async (tab) => {
      await page.evaluate((value) => { location.hash = '#/' + value; window.scrollTo(0, 0) }, tab)
      const ready = { hoje: '[data-testid=today-normal], [data-testid=today-overload]', agenda: '[data-testid=agenda-DAY]', nos: '[data-testid=shopping-section]', rotinas: '[data-testid=add-routine]', financas: '[data-testid=solo-finance]', ajustes: '[data-testid=settings-group-casal]' }
      await page.locator(ready[tab]).first().waitFor()
    }
    const settings = async (group) => { await go('ajustes'); await byId(`settings-group-${group}`).click() }
    const close = async () => { await page.keyboard.press('Escape'); await page.clock.runFor(350); await page.locator('[role=dialog]').waitFor({ state: 'detached' }) }
    const open = async (id, kind) => { await dismissToasts(); await visible(id).click(); await byId(`sheet-${kind}`).waitFor(); await page.clock.runFor(350) }
    const save = async (id) => { await page.locator('[role=dialog][aria-modal=true]').getByTestId(id).click(); await page.clock.runFor(350); await page.locator('[role=dialog]').waitFor({ state: 'detached' }) }
    const dismissToasts = async () => {
      for (let round = 0; round < 3; round++) {
        const buttons = await page.getByRole('button', { name: /^Fechar aviso/ }).all()
        if (!buttons.length) return
        // Um toast pode expirar entre a consulta e o clique. Isso não interrompe a auditoria de layout.
        for (const button of buttons) await button.evaluate((element) => element.click()).catch(() => undefined)
        await page.clock.runFor(100)
      }
    }
    const energy = async (level) => {
      const toggle = visible('battery-toggle')
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
      await visible(`energy-${level}`).click()
      if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click()
    }
    try {
      await page.clock.install({ time: new Date('2026-11-21T10:00:00-04:00') })
      await page.addInitScript(({ font, scheme }) => {
        for (const person of ['A', 'B']) localStorage.setItem(`ampara:tour:${person}`, 'done')
        localStorage.setItem('ampara:prefs', JSON.stringify({ theme: scheme, readingFont: font, readingComfort: 'wide' }))
      }, { font, scheme })
      await page.goto(base)
      await byId('setup-mode-solo').click()
      await byId('setup-cycle').click()
      await check('onboarding')
      await byId('setup-name').fill('Lucas')
      await byId('setup-password').fill(password)
      await byId('setup-password2').fill(password)
      await byId('setup-submit').click()
      await byId('app').waitFor({ timeout: 15_000 })
      await page.waitForFunction(({ font, scheme }) => document.documentElement.dataset.font === font && document.documentElement.dataset.reading === 'wide' && document.documentElement.dataset.theme === scheme, { font, scheme })

      // Dados só pela interface: os mesmos caminhos usados no dia a dia.
      await open('dock-task', 'task')
      await byId('task-title').fill(taskTitle)
      await byId('task-steps-toggle').click()
      await byId('task-step-1').fill('Abrir a pasta de documentos e separar apenas uma folha')
      await byId('task-step-add').click()
      await byId('task-step-2').fill('Conferir o que precisa ser enviado')
      await byId('task-step-add').click()
      await byId('task-step-3').fill('Guardar os documentos que sobraram')
      await check('sheet-task-microsteps')
      await save('task-save')
      await open('dock-task', 'task')
      await byId('task-title').fill('Uma ideia para conferir depois sem compromisso')
      await page.getByRole('radio', { name: 'Caixa de Entrada', exact: true }).click()
      await save('task-save')

      await go('rotinas')
      await open('add-med', 'newMed')
      await byId('new-med-name').fill('Cuidado diário com estoque para conferir')
      await byId('new-med-dosage').fill('1 unidade conforme minha rotina')
      await byId('new-med-stock').fill('3')
      await check('sheet-medication')
      await save('new-med-save')
      await open('ideas-routines', 'templates')
      await check('sheet-templates-routines')
      await byId('template-routine-water').click()
      await dismissToasts()
      await byId('templates-comfort').click()
      await check('sheet-templates-comfort')
      await byId('template-comfort-grounding').click()
      await dismissToasts()
      await byId('templates-shopping').click()
      await check('sheet-templates-shopping')
      await byId('template-shopping-basics').click()
      await dismissToasts()
      await close()

      await open('dock-expense', 'expense')
      await byId('expense-amount').fill('3500')
      await byId('expense-description').fill('Farmácia pessoal para cuidar do meu mês')
      await check('sheet-expense')
      await save('expense-save')
      await go('financas')
      await open('rule-add-PERSONAL', 'expense')
      await byId('expense-amount').fill('12000')
      await byId('expense-description').fill('Minha conta mensal prevista para hoje')
      await check('sheet-monthly-expense')
      await save('expense-save')
      await open('rule-edit', 'rule')
      await check('sheet-rule')
      await close()
      await byId('budget-edit').click()
      await byId('budget-amount').fill('120000')
      await check('finance-budget-edit')
      await byId('budget-save').click()

      await go('agenda')
      await open('agenda-new-event', 'event')
      await byId('event-title').fill('Consulta importante com tempo para chegar com calma')
      await check('sheet-event')
      await save('event-save')
      await dismissToasts()
      await go('hoje')
      await check('today-normal')
      await energy('OVERLOAD')
      await check('today-overload')
      const canWait = byId('can-wait')
      if (await canWait.count()) { await canWait.click(); await check('today-overload-expanded') }
      await energy('MEDIUM')
      await dismissToasts()

      await go('agenda')
      for (const view of ['DAY', 'WEEK', 'MONTH', 'INBOX']) { await byId(`agenda-${view}`).click(); await check(`agenda-${view.toLowerCase()}`) }
      await go('nos')
      await check('space')
      await go('rotinas')
      await check('routines')
      await go('financas')
      await check('finance')
      for (const group of ['casal', 'nuvem', 'aparelho', 'atalhos']) { await settings(group); await check(`settings-${group}`) }
      await settings('casal')
      await byId('settings-upgrade').click()
      await check('settings-upgrade')

      await open('quick-capture', 'quickCapture')
      for (const [kind, text] of [['expense', 'gastei 35 na farmácia'], ['task', 'ligar na clínica amanhã'], ['shopping', 'comprar 2 kg de arroz']]) {
        await byId('quick-input').fill(text)
        await check(`sheet-quick-${kind}`)
      }
      await byId('quick-edit').click()
      await check('sheet-quick-shopping-details')
      await close()
      await go('nos')
      await page.locator('[data-testid=shop-row]').first().getByRole('checkbox').click()
      await open('shop-expense', 'expense')
      await check('sheet-shopping-expense')
      await close()

      await open('dock-sos', 'sos')
      await check('sheet-unstuck-step1')
      await byId('unstuck-reason-task').click()
      await byId('unstuck-task').filter({ hasText: taskTitle }).click()
      await check('sheet-unstuck-step2')
      await byId('unstuck-choice-micro').click()
      await byId('unstuck-micro-input').fill('Abrir a pasta de documentos e separar apenas uma folha')
      await check('sheet-unstuck-step3')
      await save('unstuck-start')
      await check('today-focus-running')
      await page.clock.fastForward(5 * 60_000 + 1000)
      await check('today-focus-finished')
    } catch (error) {
      const issues = [String(error)]
      report.push({ context: prefix, screen: 'execution', issues })
      console.error(`[${prefix}] falha ao auditar: ${issues[0]}`)
      await page.screenshot({ path: `${out}/${prefix}-execution-error.png`, fullPage: false }).catch(() => undefined)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2))
}
const findings = report.filter((entry) => entry.issues.length)
console.log(`${report.length} telas verificadas; ${findings.length} telas com problemas.`)
process.exitCode = findings.length ? 1 : 0
