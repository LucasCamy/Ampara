import { test as base, expect, type Page } from '@playwright/test'

/** Fixture: coleta erros de console/página e falha o teste se houver algum */
export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, provide) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))
    await provide(errors)
    expect(errors, 'erros de console').toEqual([])
  },
})
export { expect }

/** Fixa o relógio local (America/Sao_Paulo) antes de carregar o app */
export async function at(page: Page, hhmm: string) {
  await page.clock.install({ time: new Date(`2026-11-05T${hhmm}:00-03:00`) })
}

const visible = (page: Page, ...ids: string[]) => page.locator(ids.map((id) => `[data-testid="${id}"]:visible`).join(', ')).first()

export async function open(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.locator('#conteudo')).toBeVisible()
}

export const quick = (page: Page, kind: 'task' | 'expense' | 'med' | 'sos') => visible(page, `dock-${kind}`, `side-quick-${kind}`).click()

export const goTab = (page: Page, tab: 'hoje' | 'agenda' | 'rotinas' | 'financas' | 'ajustes') =>
  tab === 'ajustes'
    ? page.locator('[data-testid="side-ajustes"]:visible, button[aria-label="Ajustes e atalhos do iPhone"]:visible').first().click()
    : visible(page, `nav-${tab}`, `side-${tab}`).click()

export const setViewer = (page: Page, who: 'A' | 'B') => visible(page, `viewer-${who}`).click()

export async function setEnergy(page: Page, level: 'FULL' | 'MEDIUM' | 'OVERLOAD') {
  const toggle = page.locator('[data-testid="battery-toggle"]:visible')
  if (await toggle.count()) {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  }
  await visible(page, `energy-${level}`).click()
}

export async function noHorizontalOverflow(page: Page) {
  const { overflow, culprits } = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    culprits: [...document.querySelectorAll('body *')]
      .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 0.5)
      .slice(0, 5)
      .map((e) => `${e.tagName} "${(e.textContent ?? '').slice(0, 40)}" right=${Math.round(e.getBoundingClientRect().right)}`),
  }))
  expect(overflow, `overflow horizontal em px: ${culprits.join(' | ')}`).toBeLessThanOrEqual(0)
}

export async function shot(page: Page, name: string, project: string) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: `test-results/screens/${project}/${name}.png`, fullPage: false })
}
