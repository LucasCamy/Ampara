import { at, expect, goTab, open, PASSWORDS, setViewer, shot, test } from './fixtures'

// Fluxos de acesso: roda em um celular e um desktop (os demais tamanhos já passam pelo login nos outros testes)
// eslint-disable-next-line no-empty-pattern -- o Playwright exige desestruturar as fixtures
test.beforeEach(({}, info) => {
  test.skip(!['iphone-390-light', 'desktop-1280-dark', 'mobile-360-dark'].includes(info.project.name), 'acesso validado em 3 projetos')
})

test.describe('Autenticação e segurança', () => {
  test('nada do casal aparece nem fica legível antes do login', async ({ page, errors }, info) => {
    void errors
    await at(page, '10:00')
    await page.goto('/')
    await expect(page.getByTestId('setup-form')).toBeVisible()
    await expect(page.getByTestId('app')).toHaveCount(0)
    await shot(page, '00-cadastro', info.project.name)

    // senha fraca: erro inline, não em toast
    await page.getByTestId('setup-name').fill('Lucas')
    await page.getByTestId('setup-partner').fill('Namorada')
    await page.getByTestId('setup-password').fill('1234567890')
    await page.getByTestId('setup-password2').fill('1234567890')
    await page.getByTestId('setup-submit').click()
    await expect(page.getByTestId('setup-password')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('alert').filter({ hasText: 'muito comum' })).toBeVisible()

    await page.getByTestId('setup-password').fill(PASSWORDS.A)
    await page.getByTestId('setup-password2').fill(PASSWORDS.A)
    await page.getByTestId('setup-submit').click()
    await expect(page.getByTestId('invite-code')).toHaveText(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/, { timeout: 15_000 })
    await page.getByTestId('welcome-enter').click()
    await expect(page.getByTestId('app')).toBeVisible()

    const storage = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))))
    expect(storage).not.toContain('Venvanse')
    expect(storage).not.toContain('Supermercado')
    expect(storage).not.toContain(PASSWORDS.A)
    expect(storage).not.toContain('ampara:data:v1')
  })

  test('bloquear, senha errada com erro inline e entrada com a senha certa', async ({ page, errors }, info) => {
    void errors
    await at(page, '10:00')
    await open(page)
    await goTab(page, 'ajustes')
    await page.getByRole('button', { name: 'Bloquear agora' }).click()
    await expect(page.getByTestId('login-form')).toBeVisible()
    await expect(page.getByText('Venvanse')).toHaveCount(0)

    await page.getByTestId('login-password').fill('senha errada demais')
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('login-password')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('alert')).toContainText('Senha incorreta')
    await shot(page, '00-login-erro', info.project.name)

    await page.getByTestId('login-password').fill(PASSWORDS.A)
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
  })

  test('trocar para a visão do par exige o convite e depois a senha dela', async ({ page, errors }) => {
    void errors
    await at(page, '10:00')
    await open(page)
    await page.locator('[data-testid="viewer-B"]:visible').click()
    await expect(page.getByTestId('activate-form')).toBeVisible()
    await page.getByTestId('activate-code').fill('AAAAA-BBBBB')
    await page.getByTestId('activate-password').fill(PASSWORDS.B)
    await page.getByTestId('activate-password2').fill(PASSWORDS.B)
    await page.getByTestId('activate-submit').click()
    await expect(page.getByRole('alert')).toContainText('Código de convite inválido')

    // volta para Lucas e entra como ela pelo caminho certo
    await page.getByTestId('login-person-A').click()
    await page.getByTestId('login-password').fill(PASSWORDS.A)
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
    await setViewer(page, 'B')
    await setViewer(page, 'A')
    await setViewer(page, 'B')
  })

  test('sem "manter conectado", recarregar pede a senha', async ({ page, errors }) => {
    void errors
    await at(page, '10:00')
    await page.goto('/')
    await page.getByTestId('setup-name').fill('Lucas')
    await page.getByTestId('setup-partner').fill('Namorada')
    await page.getByTestId('setup-password').fill(PASSWORDS.A)
    await page.getByTestId('setup-password2').fill(PASSWORDS.A)
    await page.getByTestId('setup-remember').click()
    await page.getByTestId('setup-submit').click()
    await page.getByTestId('welcome-enter').click({ timeout: 15_000 })
    await expect(page.getByTestId('app')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('login-form')).toBeVisible()
  })

  test('bloquear em uma aba bloqueia as outras', async ({ page, context, errors }) => {
    void errors
    await open(page)
    const other = await context.newPage()
    await other.goto('/')
    await expect(other.getByTestId('app')).toBeVisible({ timeout: 15_000 })
    await goTab(page, 'ajustes')
    await page.getByRole('button', { name: 'Bloquear agora' }).click()
    await expect(other.getByTestId('login-form')).toBeVisible()
    await expect(other.getByText('Venvanse')).toHaveCount(0)
  })

  test('build com CSP e cabeçalhos anti-clickjacking', async ({ page }) => {
    const res = await page.goto('/')
    expect(res?.headers()['x-frame-options']).toBe('DENY')
    expect(res?.headers()['x-content-type-options']).toBe('nosniff')
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("object-src 'none'")
  })
})
