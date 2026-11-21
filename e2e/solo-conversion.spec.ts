import { readFileSync } from 'node:fs'
import type { Download } from '@playwright/test'
import { expect, goSettings, goTab, noHorizontalOverflow, open, PASSWORDS, quick, setViewer, skipTour, test, type Page } from './fixtures'
import { FAKE_URL, FakeSupabase } from './fake-supabase'

// eslint-disable-next-line no-empty-pattern -- o Playwright exige desestruturar as fixtures
test.beforeEach(({}, info) => {
  test.skip(!['iphone-390-light', 'desktop-1280-dark'].includes(info.project.name), 'conversão validada em dois projetos')
})

const sharedTitle = 'Registro compartilhado antes da mudança'
const privateTitle = { A: 'Memória financeira reservada de Lucas', B: 'Memória financeira reservada de Namorada' } as const
const otherOf = (who: 'A' | 'B') => who === 'A' ? 'B' : 'A'
const inviteCode = async (page: Page) => (await page.getByTestId('settings-invite').textContent())?.match(/[A-Z2-9]{5}-[A-Z2-9]{5}/)?.[0] ?? ''

async function addPrivateExpense(page: Page, who: 'A' | 'B') {
  await quick(page, 'expense')
  const sheet = page.getByTestId('sheet-expense')
  await sheet.getByTestId('expense-amount').fill(who === 'A' ? '1700' : '2900')
  await sheet.getByTestId('expense-description').fill(privateTitle[who])
  await sheet.getByRole('radio', { name: 'Só meu', exact: true }).click()
  await sheet.getByTestId('expense-gift').click()
  await sheet.getByTestId('expense-save').click()
  await expect(sheet).toBeHidden()
}

async function conversionForm(page: Page) {
  await goSettings(page, 'casal')
  await page.getByTestId('conversion-open').click()
  const form = page.getByTestId('conversion-form')
  await expect(form).toContainText('autoria')
  await expect(form).toContainText('privacidade')
  await expect(form).toContainText('acesso do seu par')
  return form
}

async function convert(page: Page, who: 'A' | 'B'): Promise<Download> {
  await page.getByTestId('conversion-password').fill(PASSWORDS[who])
  const download = page.waitForEvent('download')
  await page.getByTestId('conversion-submit').click()
  const file = await download
  await expect(page.getByText('Só para mim', { exact: true })).toBeVisible({ timeout: 20_000 })
  return file
}

async function checkBackup(file: Download) {
  expect(file.suggestedFilename()).toMatch(/^ampara-antes-do-solo-\d{4}-\d{2}-\d{2}\.ampara$/)
  const path = await file.path()
  const content = readFileSync(path, 'utf8')
  expect(JSON.parse(content)).toMatchObject({ format: 'ampara-backup', version: 1, vault: { v: 1, data: { ct: expect.any(String), iv: expect.any(String) } } })
  expect(content).not.toContain(privateTitle.A)
  expect(content).not.toContain(privateTitle.B)
  expect(content).not.toContain(sharedTitle)
  expect(content).not.toContain(PASSWORDS.A)
  expect(content).not.toContain(PASSWORDS.B)
  expect(content).not.toContain('refreshToken')
  return path
}

for (const who of ['A', 'B'] as const) {
  test(`Casal vira Solo por ${who}: senha, backup funcional, autoria e convite do mesmo par`, async ({ browser, page, errors }) => {
    void errors
    test.setTimeout(120_000)
    await open(page)
    await addPrivateExpense(page, 'A')
    await setViewer(page, 'B')
    await addPrivateExpense(page, 'B')
    await goTab(page, 'nos')
    await page.getByTestId('shopping-input').fill(sharedTitle)
    await page.getByTestId('shopping-input').press('Enter')
    await setViewer(page, who)
    await conversionForm(page)
    const downloads: Download[] = []
    page.on('download', (file) => downloads.push(file))
    await page.getByTestId('conversion-password').fill('senha atual incorreta')
    await page.getByTestId('conversion-submit').click()
    await expect(page.getByTestId('conversion-password')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('alert')).toContainText(/senha/i)
    expect(downloads).toHaveLength(0)
    await expect(page.getByTestId('conversion-open')).toBeVisible()
    await noHorizontalOverflow(page)

    const file = await convert(page, who)
    const path = await checkBackup(file)
    expect(downloads).toHaveLength(1)
    await expect(page.getByTestId('solo-history')).toContainText('privacidade originais')
    await page.reload()
    await expect(page.locator('[data-testid=app], [data-testid=login-form]').first()).toBeVisible({ timeout: 15_000 })
    if (await page.getByTestId('login-form').isVisible()) {
      await page.getByTestId(`login-person-${who}`).click()
      await page.getByTestId('login-password').fill(PASSWORDS[who])
      await page.getByTestId('login-submit').click()
    }
    await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
    await goTab(page, 'nos')
    const shared = page.locator('[data-testid="shop-row"]').filter({ hasText: sharedTitle })
    await expect(shared).toContainText(who === 'B' ? 'pedido por você' : 'pedido por Namorada')
    await goTab(page, 'financas')
    await expect(page.getByTestId('personal-list')).toContainText(privateTitle[who])
    await expect(page.getByText(privateTitle[otherOf(who)], { exact: true })).toHaveCount(0)
    await goSettings(page, 'aparelho')
    await page.getByRole('button', { name: 'Bloquear agora', exact: true }).click()
    await page.getByTestId(`login-person-${otherOf(who)}`).click()
    await expect(page.getByTestId('login-absent')).toBeVisible()
    await expect(page.getByTestId('login-form')).toHaveCount(0)
    await page.getByTestId(`login-person-${who}`).click()
    await page.getByTestId('login-password').fill(PASSWORDS[who])
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })

    // O arquivo abre a versão anterior à conversão em outro aparelho e mantém o modo Casal.
    const restoreContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined, locale: 'pt-BR' })
    try {
      const fresh = await restoreContext.newPage()
      await skipTour(fresh)
      await fresh.goto('/')
      await fresh.getByTestId('setup-restore').click()
      await fresh.getByTestId('restore-file').setInputFiles(path)
      await fresh.getByTestId('restore-password').fill(PASSWORDS[who])
      await fresh.getByTestId('restore-submit').click()
      await expect(fresh.getByTestId('login-form')).toBeVisible({ timeout: 15_000 })
      await fresh.getByTestId('login-password').fill(PASSWORDS[who])
      await fresh.getByTestId('login-submit').click()
      await expect(fresh.getByTestId('app')).toBeVisible({ timeout: 15_000 })
      await goTab(fresh, 'financas')
      await expect(fresh.getByTestId('fin-US')).toBeVisible()
      await goTab(fresh, 'nos')
      await expect(fresh.locator('[data-testid="shop-row"]').filter({ hasText: sharedTitle })).toHaveCount(1)
    } finally {
      await restoreContext.close()
    }

    await goSettings(page, 'casal')
    await page.getByTestId('settings-upgrade').click()
    await expect(page.getByTestId('upgrade-original-partner')).toHaveText(who === 'A' ? 'Retomar com Namorada' : 'Retomar com Lucas')
    await expect(page.getByTestId('upgrade-partner')).toHaveCount(0)
    await page.getByTestId('upgrade-password').fill(PASSWORDS[who])
    await page.getByTestId('upgrade-submit').click()
    await expect(page.getByTestId('settings-invite')).toBeVisible({ timeout: 15_000 })
    const code = await inviteCode(page)
    expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
    await page.locator(`[data-testid="viewer-${otherOf(who)}"]:visible`).click()
    await page.getByTestId('activate-code').fill(code)
    await page.getByTestId('activate-password').fill(PASSWORDS[otherOf(who)])
    await page.getByTestId('activate-password2').fill(PASSWORDS[otherOf(who)])
    await page.getByTestId('activate-submit').click()
    await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
    await goTab(page, 'financas')
    await page.getByTestId('fin-MINE').click()
    await expect(page.getByTestId('personal-list')).toContainText(privateTitle[otherOf(who)])
  })
}

test('falha ao preparar o download mantém Casal e os acessos locais', async ({ page, errors }) => {
  void errors
  await open(page)
  await conversionForm(page)
  await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('Não foi possível preparar o arquivo de backup.') } })
  await page.getByTestId('conversion-password').fill(PASSWORDS.A)
  await page.getByTestId('conversion-submit').click()
  await expect(page.getByRole('alert')).toContainText(/backup|arquivo/i)
  await expect(page.getByTestId('conversion-open')).toBeVisible()
  await expect(page.getByText('Só para mim', { exact: true })).toHaveCount(0)
  await setViewer(page, 'B')
  await expect(page.getByTestId('app')).toBeVisible()
})

async function connectedCouple(page: Page, server: FakeSupabase) {
  await server.attach(page.context())
  await open(page)
  await goTab(page, 'nos')
  await page.getByTestId('shopping-input').fill(sharedTitle)
  await page.getByTestId('shopping-input').press('Enter')
  await addPrivateExpense(page, 'A')
  await goSettings(page, 'nuvem')
  await page.getByTestId('cloud-email').fill('owner-a@ampara.local')
  await page.getByTestId('cloud-password').fill(PASSWORDS.A)
  await page.getByTestId('cloud-submit').click()
  await expect(page.getByTestId('cloud-section')).toContainText('Conectado como owner-a@ampara.local', { timeout: 20_000 })
  await expect(page.locator('[data-testid=sync-pill]:visible')).toHaveAttribute('data-state', 'ok', { timeout: 20_000 })
  await goSettings(page, 'casal')
  return inviteCode(page)
}

async function cloudEntry(page: Page, email: string, password: string, code?: string) {
  await skipTour(page)
  await page.goto('/')
  await page.getByTestId('setup-cloud').click()
  if (code) {
    await page.getByTestId('cloud-entry-code').fill(code)
    await page.getByTestId('cloud-entry-password2').fill(password)
  } else await page.getByTestId('cloud-entry-signin').click()
  await page.getByTestId('cloud-entry-email').fill(email)
  await page.getByTestId('cloud-entry-password').fill(password)
  await page.getByTestId('cloud-entry-submit').click()
  await expect(page.getByTestId('app')).toBeVisible({ timeout: 20_000 })
}

const entityRows = (server: FakeSupabase) => Object.fromEntries(
  [...server.tables]
    .filter(([name]) => name !== 'couples')
    .map(([name, rows]) => [name, [...rows.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, value]) => [id, Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'synced_at'))])]),
)

test('falha da RPC mantém modo Casal, dados e vínculo, com backup cifrado já baixado', async ({ page, errors }) => {
  void errors
  test.setTimeout(90_000)
  const server = new FakeSupabase()
  await connectedCouple(page, server)
  const previous = structuredClone(entityRows(server))
  const space = server.members[0]!.couple_id
  const members = structuredClone(server.members)
  await page.route('**/rest/v1/rpc/convert_to_solo', (route) => route.fulfill({
    status: route.request().method() === 'OPTIONS' ? 204 : 503,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' },
    contentType: 'application/json',
    body: route.request().method() === 'OPTIONS' ? '' : JSON.stringify({ message: 'Servidor indisponível para esta mudança.' }),
  }))
  await conversionForm(page)
  await page.getByTestId('conversion-password').fill(PASSWORDS.A)
  const pendingDownload = page.waitForEvent('download')
  await page.getByTestId('conversion-submit').click()
  await checkBackup(await pendingDownload)
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('conversion-open')).toBeVisible()
  expect(server.tables.get('couples')!.get(space)?.mode).toBe('COUPLE')
  expect(server.members).toEqual(members)
  expect(entityRows(server)).toEqual(previous)
  expect(server.anonWrites).toBe(0)
})

test('B assume Solo na nuvem: revoga A, preserva registros e recupera o modo noutro aparelho', async ({ browser, page, errors }) => {
  void errors
  test.setTimeout(150_000)
  const server = new FakeSupabase()
  const code = await connectedCouple(page, server)
  const partnerContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined, locale: 'pt-BR' })
  const nextContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined, locale: 'pt-BR' })
  const restoredContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined, locale: 'pt-BR' })
  try {
    await server.attach(partnerContext)
    const partner = await partnerContext.newPage()
    await cloudEntry(partner, 'owner-b@ampara.local', PASSWORDS.B, code)
    await addPrivateExpense(partner, 'B')
    await goSettings(partner, 'nuvem')
    await partner.getByTestId('cloud-sync').click()
    await expect(partner.locator('[data-testid=sync-pill]:visible')).toHaveAttribute('data-state', 'ok', { timeout: 20_000 })
    const space = server.members[0]!.couple_id
    const before = structuredClone(entityRows(server))
    await conversionForm(partner)
    await checkBackup(await convert(partner, 'B'))
    expect(server.tables.get('couples')!.get(space)).toMatchObject({ mode: 'SOLO', solo_owner_id: 'B' })
    expect(server.members.find((member) => member.couple_id === space && member.partner_id === 'A')?.revoked_at).toBeTruthy()
    expect(server.members.find((member) => member.couple_id === space && member.partner_id === 'B')?.revoked_at).toBeFalsy()
    expect(entityRows(server)).toEqual(before)

    const ownerA = server.users.get('owner-a@ampara.local')!
    const accessA = [...server.access].find(([, session]) => session.userId === ownerA.id)![0]
    const read = await page.evaluate(async ({ token, space, url }) => {
      const response = await fetch(`${url}/rest/v1/transactions?couple_id=eq.${space}`, { headers: { Authorization: `Bearer ${token}`, apikey: 'anon-key-de-teste' } })
      return { status: response.status, rows: await response.json() }
    }, { token: accessA, space, url: FAKE_URL })
    expect(read.status === 403 || (read.status === 200 && Array.isArray(read.rows) && read.rows.length === 0)).toBe(true)
    await goSettings(page, 'nuvem')
    await page.getByTestId('cloud-sync').click()
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('toast').filter({ hasText: 'acesso desta conta ao espaço foi suspenso' })).toHaveCount(1)
    expect(entityRows(server)).toEqual(before)

    await server.attach(nextContext)
    const next = await nextContext.newPage()
    await cloudEntry(next, 'owner-b@ampara.local', PASSWORDS.B)
    await goSettings(next, 'casal')
    await expect(next.getByText('Só para mim', { exact: true })).toBeVisible()
    await expect(next.getByRole('textbox', { name: 'Seu nome', exact: true })).toHaveValue('Namorada')
    await expect(next.getByTestId('solo-history')).toContainText('Lucas')
    await goTab(next, 'nos')
    await expect(next.locator('[data-testid=shop-row]').filter({ hasText: sharedTitle })).toHaveCount(1)
    await goTab(next, 'financas')
    await expect(next.getByTestId('personal-list')).toContainText(privateTitle.B)
    await expect(next.getByText(privateTitle.A, { exact: true })).toHaveCount(0)
    await goSettings(next, 'casal')
    await next.getByTestId('settings-upgrade').click()
    await expect(next.getByTestId('upgrade-original-partner')).toHaveText('Retomar com Lucas')
    await next.getByTestId('upgrade-password').fill(PASSWORDS.B)
    await next.getByTestId('upgrade-submit').click()
    await expect(next.getByTestId('settings-invite')).toContainText('Lucas', { timeout: 20_000 })
    const renewed = await inviteCode(next)
    await expect.poll(() => server.tables.get('couples')!.get(space)?.mode, { timeout: 20_000 }).toBe('COUPLE')
    await server.attach(restoredContext)
    const restored = await restoredContext.newPage()
    await cloudEntry(restored, 'owner-a@ampara.local', PASSWORDS.A, renewed)
    await goTab(restored, 'financas')
    await restored.getByTestId('fin-MINE').click()
    await expect(restored.getByTestId('personal-list')).toContainText(privateTitle.A)
    await expect(restored.getByText(privateTitle.B, { exact: true })).toHaveCount(0)
    expect(entityRows(server)).toEqual(before)
    expect(server.anonWrites).toBe(0)
  } finally {
    await partnerContext.close()
    await nextContext.close()
    await restoredContext.close()
  }
})
