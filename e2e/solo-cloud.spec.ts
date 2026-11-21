import { expect, goSettings, goTab, noHorizontalOverflow, PASSWORDS, skipTour, test, type Page } from './fixtures'
import { FakeSupabase } from './fake-supabase'

// eslint-disable-next-line no-empty-pattern -- o Playwright exige desestruturar as fixtures
test.beforeEach(({}, info) => {
  test.skip(!['iphone-390-light', 'desktop-1280-dark'].includes(info.project.name), 'Solo na nuvem validado em 2 projetos')
})

async function setupSolo(page: Page, server: FakeSupabase) {
  await server.attach(page.context())
  await skipTour(page)
  await page.goto('/')
  await page.getByTestId('setup-mode-solo').click()
  await page.getByTestId('setup-name').fill('Lucas')
  await page.getByTestId('setup-password').fill(PASSWORDS.A)
  await page.getByTestId('setup-password2').fill(PASSWORDS.A)
  await page.getByTestId('setup-submit').click()
  await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
  await goTab(page, 'nos')
  await page.getByTestId('shopping-input').fill('Caderno antes do convite')
  await page.getByTestId('shopping-input').press('Enter')
  await goSettings(page, 'nuvem')
  await page.getByTestId('cloud-email').fill('solo@ampara.local')
  await page.getByTestId('cloud-password').fill(PASSWORDS.A)
  await page.getByTestId('cloud-submit').click()
  await expect(page.getByTestId('cloud-section')).toContainText('Conectado como solo@ampara.local', { timeout: 15_000 })
  await expect.poll(() => [...(server.tables.get('shopping_items')?.values() ?? [])].some((r) => r.title === 'Caderno antes do convite'), { timeout: 15_000 }).toBe(true)
}

async function enterCloud(page: Page, email: string, password: string, invite?: string) {
  await skipTour(page)
  await page.goto('/')
  await page.getByTestId('setup-cloud').click()
  if (invite) {
    await page.getByTestId('cloud-entry-code').fill(invite)
    await page.getByTestId('cloud-entry-password2').fill(password)
  } else {
    await page.getByTestId('cloud-entry-signin').click()
  }
  await page.getByTestId('cloud-entry-email').fill(email)
  await page.getByTestId('cloud-entry-password').fill(password)
  await page.getByTestId('cloud-entry-submit').click()
  await expect(page.getByTestId('app')).toBeVisible({ timeout: 20_000 })
}

test('Solo na nuvem: outro aparelho recupera modo, módulos e dados sem convite', async ({ browser, page, errors }) => {
  void errors
  test.setTimeout(90_000)
  const server = new FakeSupabase()
  await setupSolo(page, server)
  expect([...server.tables.get('couples')!.values()][0]).toMatchObject({ mode: 'SOLO' })
  expect(server.invites).toHaveLength(0)
  await expect(page.getByTestId('cloud-section')).not.toContainText('Tenho um convite')

  const second = await browser.newContext({ viewport: page.viewportSize() ?? undefined, locale: 'pt-BR' })
  try {
    await server.attach(second)
    const next = await second.newPage()
    const pageErrors: string[] = []
    next.on('pageerror', (error) => pageErrors.push(String(error)))
    await enterCloud(next, 'solo@ampara.local', PASSWORDS.A)
    await goSettings(next, 'casal')
    await expect(next.getByText('Só para mim', { exact: true })).toBeVisible()
    await expect(next.getByTestId('settings-module-cycle')).toHaveAttribute('aria-checked', 'false')
    await expect(next.getByTestId('settings-module-shopping')).toHaveAttribute('aria-checked', 'true')
    await goTab(next, 'nos')
    await expect(next.locator('[data-testid="shop-row"][data-title="Caderno antes do convite"]')).toHaveCount(1)
    await noHorizontalOverflow(next)
    expect(pageErrors).toEqual([])
    expect(server.anonWrites).toBe(0)
    expect(server.failures).toEqual([])
  } finally {
    await second.close()
  }
})

test('Solo na nuvem: promoção atualiza perfil convidado e preserva dados no novo aparelho do par', async ({ browser, page, errors }) => {
  void errors
  test.setTimeout(90_000)
  const server = new FakeSupabase()
  await setupSolo(page, server)
  const space = server.members[0]!.couple_id
  // O perfil reservado já existe no servidor antes da promoção.
  await expect.poll(() => server.tables.get('profiles')?.has(`${space}|B`)).toBe(true)
  expect(server.tables.get('profiles')!.get(`${space}|B`)?.display_name).toBe('')
  await goSettings(page, 'casal')
  await page.getByTestId('settings-upgrade').click()
  await page.getByTestId('upgrade-partner').fill('Marina')
  await page.getByTestId('upgrade-password').fill(PASSWORDS.A)
  await page.getByTestId('upgrade-submit').click()
  await expect(page.getByTestId('settings-invite')).toContainText('Marina', { timeout: 15_000 })
  await expect.poll(() => server.invites.length, { timeout: 15_000 }).toBe(1)
  expect(server.tables.get('couples')!.get(space)?.mode).toBe('COUPLE')
  expect(server.tables.get('profiles')!.get(`${space}|B`)).toMatchObject({ display_name: 'Marina', enabled_modules: { cycle: true, shopping: true, goals: true } })
  const invite = (await page.getByTestId('settings-invite').textContent())?.match(/[A-Z2-9]{5}-[A-Z2-9]{5}/)?.[0]
  expect(invite).toBeTruthy()

  const partner = await browser.newContext({ viewport: page.viewportSize() ?? undefined, locale: 'pt-BR' })
  try {
    await server.attach(partner)
    const next = await partner.newPage()
    const pageErrors: string[] = []
    next.on('pageerror', (error) => pageErrors.push(String(error)))
    await enterCloud(next, 'marina@ampara.local', PASSWORDS.B, invite!)
    await goSettings(next, 'casal')
    await expect(next.getByRole('textbox', { name: 'Seu nome', exact: true })).toHaveValue('Marina')
    await expect(next.getByTestId('settings-module-cycle')).toHaveAttribute('aria-checked', 'true')
    await goTab(next, 'nos')
    await expect(next.locator('[data-testid="shop-row"][data-title="Caderno antes do convite"]')).toHaveCount(1)
    await noHorizontalOverflow(next)
    await goSettings(page, 'casal')
    await expect(page.getByTestId('settings-module-cycle')).toHaveAttribute('aria-checked', 'false')
    expect(pageErrors).toEqual([])
    expect(server.anonWrites).toBe(0)
    expect(server.failures).toEqual([])
  } finally {
    await partner.close()
  }
})

test('convite local continua visível quando a publicação falha e pode ser renovado ao reconectar', async ({ page, errors }) => {
  void errors
  const server = new FakeSupabase()
  await setupSolo(page, server)
  const inviteRoute = '**/rest/v1/rpc/create_invite'
  await page.route(inviteRoute, (route) => route.abort('internetdisconnected'))
  await goSettings(page, 'casal')
  await page.getByTestId('settings-upgrade').click()
  await page.getByTestId('upgrade-partner').fill('Marina')
  await page.getByTestId('upgrade-password').fill(PASSWORDS.A)
  await page.getByTestId('upgrade-submit').click()
  await expect(page.getByTestId('settings-invite')).toContainText('Marina')
  await expect(page.getByTestId('toast').last()).toContainText('Convite salvo neste aparelho')
  expect(server.invites).toHaveLength(0)
  const original = (await page.getByTestId('settings-invite').textContent())?.match(/[A-Z2-9]{5}-[A-Z2-9]{5}/)?.[0]
  expect(original).toBeTruthy()

  await page.unroute(inviteRoute)
  await goSettings(page, 'aparelho')
  await page.getByRole('button', { name: 'Novo convite para Marina', exact: true }).click()
  await page.getByLabel('Sua senha', { exact: true }).fill(PASSWORDS.A)
  await page.getByRole('button', { name: 'Gerar novo convite', exact: true }).click()
  await expect(page.getByTestId('reinvite-code')).toHaveText(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/, { timeout: 15_000 })
  const renewed = (await page.getByTestId('reinvite-code').textContent())?.trim()
  expect(renewed).not.toBe(original)
  await expect.poll(() => server.invites.length).toBe(1)
  expect(server.failures).toEqual([])
  await goTab(page, 'nos')
  await expect(page.locator('[data-testid="shop-row"][data-title="Caderno antes do convite"]')).toHaveCount(1)
})
