import { at, expect, goSettings, goTab, noHorizontalOverflow, PASSWORDS, skipTour, test, type Page } from './fixtures'

// eslint-disable-next-line no-empty-pattern -- o Playwright exige desestruturar as fixtures
test.beforeEach(({}, info) => {
  test.skip(!['iphone-390-light', 'desktop-1280-dark', 'mobile-360-dark'].includes(info.project.name), 'modo Solo validado em 3 projetos')
})

async function setupSolo(page: Page, cycle = false) {
  await at(page, '10:00')
  await skipTour(page)
  await page.goto('/')
  await page.getByTestId('setup-mode-solo').click()
  await expect(page.getByTestId('setup-partner')).toHaveCount(0)
  await expect(page.getByTestId('setup-demo')).toHaveCount(0)
  await page.getByTestId('setup-name').fill('Lucas')
  await page.getByTestId('setup-password').fill(PASSWORDS.A)
  await page.getByTestId('setup-password2').fill(PASSWORDS.A)
  if (cycle) await page.getByTestId('setup-cycle').click()
  await noHorizontalOverflow(page)
  await page.getByTestId('setup-submit').click()
  await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('invite-code')).toHaveCount(0)
  await expect(page.getByTestId('welcome-enter')).toHaveCount(0)
}

test.describe('Modo Solo · cadastro e armazenamento', () => {
  test('cria sem convite, guarda o cofre cifrado no IndexedDB e lembra a sessão', async ({ page, errors }) => {
    void errors
    await setupSolo(page)
    await goSettings(page, 'casal')
    await expect(page.getByText('Só para mim', { exact: true })).toBeVisible()
    await expect(page.getByTestId('settings-module-cycle')).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('settings-module-shopping')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('settings-module-goals')).toHaveAttribute('aria-checked', 'true')

    const stored = await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('ampara-local', 1)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        const vault = await new Promise<unknown>((resolve, reject) => {
          const request = database.transaction('vault').objectStore('vault').get('primary')
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        return { vault, oldVault: localStorage.getItem('ampara:vault:v1') }
      } finally {
        database.close()
      }
    })
    expect(stored.vault).toMatchObject({ v: 1, data: { ct: expect.any(String), iv: expect.any(String) } })
    expect(stored.oldVault).toBeNull()
    expect(JSON.stringify(stored.vault)).not.toContain(PASSWORDS.A)
    expect(JSON.stringify(stored.vault)).not.toContain('enabledModules')

    await page.reload()
    await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
    await goSettings(page, 'casal')
    await expect(page.getByText('Só para mim', { exact: true })).toBeVisible()
    await goSettings(page, 'aparelho')
    await expect(page.getByRole('button', { name: 'Restaurar dados de exemplo', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Novo convite para/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Bloquear agora', exact: true }).click()
    await page.reload()
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('login-password').fill(PASSWORDS.A)
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
    await goSettings(page, 'casal')
    await expect(page.getByText('Só para mim', { exact: true })).toBeVisible()
  })

  test('ciclo opcional e escolhas de módulos persistem após recarregar', async ({ page, errors }) => {
    void errors
    await setupSolo(page, true)
    await goSettings(page, 'casal')
    await expect(page.getByTestId('settings-module-cycle')).toHaveAttribute('aria-checked', 'true')
    await page.getByTestId('settings-module-shopping').click()
    await expect(page.getByTestId('toast').last()).toContainText('Desfazer')
    await page.getByTestId('settings-module-goals').click()
    await expect(page.getByTestId('settings-module-shopping')).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('settings-module-goals')).toHaveAttribute('aria-checked', 'false')
    // Bloquear espera as gravações cifradas antes de fechar a sessão.
    await goSettings(page, 'aparelho')
    await page.getByRole('button', { name: 'Bloquear agora', exact: true }).click()
    await page.reload()
    await page.getByTestId('login-password').fill(PASSWORDS.A)
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
    await goSettings(page, 'casal')
    await expect(page.getByTestId('settings-module-cycle')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('settings-module-shopping')).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('settings-module-goals')).toHaveAttribute('aria-checked', 'false')
    await noHorizontalOverflow(page)
  })

  test('convite exige a senha atual e transforma em Casal preservando registros', async ({ page, errors }) => {
    void errors
    await setupSolo(page)
    await goTab(page, 'nos')
    await page.getByTestId('shopping-input').fill('Meu registro antes do convite')
    await page.getByTestId('shopping-input').press('Enter')
    await expect(page.locator('[data-testid="shop-row"][data-title="Meu registro antes do convite"]')).toHaveCount(1)
    await goSettings(page, 'casal')
    await page.getByTestId('settings-upgrade').click()
    await page.getByTestId('upgrade-partner').fill('Marina')
    await page.getByTestId('upgrade-password').fill('senha errada qualquer')
    await page.getByTestId('upgrade-submit').click()
    await expect(page.getByTestId('upgrade-password')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('alert')).toContainText('Senha incorreta')
    await expect(page.getByText('Só para mim', { exact: true })).toBeVisible()
    await expect(page.getByTestId('settings-invite')).toHaveCount(0)
    await noHorizontalOverflow(page)
    await page.getByTestId('upgrade-password').fill(PASSWORDS.A)
    await page.getByTestId('upgrade-submit').click()
    await expect(page.getByTestId('settings-invite')).toContainText('Marina', { timeout: 15_000 })
    const code = (await page.getByTestId('settings-invite').textContent())?.match(/[A-Z2-9]{5}-[A-Z2-9]{5}/)?.[0]
    expect(code).toBeTruthy()
    await expect(page.getByTestId('settings-upgrade')).toHaveCount(0)
    // A preferência pessoal de ciclo não muda ao convidar alguém.
    await expect(page.getByTestId('settings-module-cycle')).toHaveAttribute('aria-checked', 'false')
    await page.reload()
    await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
    await goTab(page, 'nos')
    await expect(page.locator('[data-testid="shop-row"][data-title="Meu registro antes do convite"]')).toHaveCount(1)
    await goSettings(page, 'aparelho')
    await page.getByRole('button', { name: 'Bloquear agora', exact: true }).click()
    await page.getByTestId('login-person-B').click()
    await page.getByTestId('activate-code').fill(code!)
    await page.getByTestId('activate-password').fill(PASSWORDS.B)
    await page.getByTestId('activate-password2').fill(PASSWORDS.B)
    await page.getByTestId('activate-submit').click()
    await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
    await goTab(page, 'nos')
    await expect(page.locator('[data-testid="shop-row"][data-title="Meu registro antes do convite"]')).toHaveCount(1)
  })
})
