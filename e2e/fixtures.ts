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

export const PASSWORDS = { A: 'cafe com pao na varanda', B: 'cha de hortela no jardim' } as const
const invites = new WeakMap<Page, string>()

const ready = (page: Page) =>
  expect(page.locator('[data-testid="setup-form"], [data-testid="login-form"], [data-testid="activate-form"], [data-testid="app"]').first()).toBeVisible({ timeout: 15_000 })

/** Primeiro uso: cria o espaço do casal (Lucas) e guarda o convite da parceira */
export async function setupCouple(page: Page) {
  await page.getByTestId('setup-name').fill('Lucas')
  await page.getByTestId('setup-password').fill(PASSWORDS.A)
  await page.getByTestId('setup-password2').fill(PASSWORDS.A)
  await page.getByTestId('setup-partner').fill('Namorada')
  await page.getByTestId('setup-submit').click()
  const code = (await page.getByTestId('invite-code').textContent({ timeout: 15_000 }))?.trim() ?? ''
  invites.set(page, code)
  await page.getByTestId('welcome-enter').click()
  await expect(page.getByTestId('app')).toBeVisible()
}

export async function open(page: Page, path = '/') {
  await page.goto(path)
  await ready(page)
  if (await page.getByTestId('setup-form').isVisible()) await setupCouple(page)
  await expect(page.getByTestId('app')).toBeVisible()
}

export const inviteOf = (page: Page) => invites.get(page) ?? ''

export const quick = (page: Page, kind: 'task' | 'expense' | 'med' | 'sos') => visible(page, `dock-${kind}`, `side-quick-${kind}`).click()

export const goTab = (page: Page, tab: 'hoje' | 'agenda' | 'rotinas' | 'financas' | 'ajustes') =>
  tab === 'ajustes'
    ? page.locator('[data-testid="side-ajustes"]:visible, button[aria-label="Ajustes e atalhos do iPhone"]:visible').first().click()
    : visible(page, `nav-${tab}`, `side-${tab}`).click()

/** Trocar de pessoa exige autenticar a outra pessoa (primeiro acesso usa o convite) */
export async function setViewer(page: Page, who: 'A' | 'B') {
  const radio = visible(page, `viewer-${who}`)
  if ((await radio.getAttribute('aria-checked')) === 'true') return
  await radio.click()
  await expect(page.getByTestId('app')).toHaveCount(0)
  await ready(page)
  if (await page.getByTestId('activate-form').isVisible()) {
    await page.getByTestId('activate-code').fill(inviteOf(page))
    await page.getByTestId('activate-password').fill(PASSWORDS[who])
    await page.getByTestId('activate-password2').fill(PASSWORDS[who])
    await page.getByTestId('activate-submit').click()
  } else {
    await page.getByTestId('login-password').fill(PASSWORDS[who])
    await page.getByTestId('login-submit').click()
  }
  await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
  await expect(visible(page, `viewer-${who}`)).toHaveAttribute('aria-checked', 'true')
}

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
