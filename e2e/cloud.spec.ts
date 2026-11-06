import { expect, goTab, noHorizontalOverflow, open, shot, test } from './fixtures'
import { FakeSupabase } from './fake-supabase'

// Dois aparelhos (dois contextos isolados) falando com o mesmo Supabase simulado
// eslint-disable-next-line no-empty-pattern -- o Playwright exige desestruturar as fixtures
test.beforeEach(({}, info) => {
  test.skip(!['iphone-390-light', 'desktop-1280-dark'].includes(info.project.name), 'nuvem validada em 2 projetos')
})

const PW_B = 'cha de hortela no jardim'

test('nuvem: cada um no seu celular, com sync e privacidade aplicada pelo servidor', async ({ browser, page, errors }, info) => {
  void errors
  test.setTimeout(90_000)
  const server = new FakeSupabase()
  await server.attach(page.context())

  // ---- Aparelho do Lucas: cria o espaço local, um presente secreto e conecta a nuvem
  await open(page)
  await page.locator('[data-testid="dock-expense"]:visible, [data-testid="side-quick-expense"]:visible').first().click()
  const sheet = page.getByTestId('sheet-expense')
  await sheet.getByTestId('expense-amount').pressSequentially('25000')
  await sheet.getByTestId('expense-description').fill('Colar de presente')
  await sheet.getByRole('radio', { name: 'Só meu' }).click()
  await sheet.getByTestId('expense-gift').click()
  await sheet.getByTestId('expense-save').click()
  await expect(sheet).toBeHidden()

  await goTab(page, 'ajustes')
  await page.getByTestId('cloud-email').fill('lucas@exemplo.com')
  await page.getByTestId('cloud-password').fill('cafe com pao na varanda')
  await page.getByTestId('cloud-submit').click()
  const cloud = page.getByTestId('cloud-section')
  await expect(cloud).toContainText('Conectado como lucas@exemplo.com', { timeout: 15_000 })
  await noHorizontalOverflow(page)
  await shot(page, '20-nuvem-conectada', info.project.name)
  const invite = (await cloud.locator('.font-data').filter({ hasText: /^[A-Z2-9]{5}-[A-Z2-9]{5}$/ }).textContent())?.trim() ?? ''
  expect(invite).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
  await expect(page.locator('[data-testid="sync-pill"]:visible')).toHaveAttribute('data-state', 'ok', { timeout: 20_000 })

  // o servidor nunca recebeu o código de convite em texto claro nem gravação sem token
  expect(JSON.stringify([...server.tables.get('couples')!.values()])).not.toContain(invite)
  expect(server.anonWrites).toBe(0)

  // ---- Aparelho da Namorada: aparelho novo, entra pelo convite
  const ctxB = await browser.newContext({ viewport: page.viewportSize() ?? undefined, colorScheme: 'dark' })
  await server.attach(ctxB)
  const b = await ctxB.newPage()
  const errorsB: string[] = []
  b.on('pageerror', (e) => errorsB.push(String(e)))
  await b.goto('/')
  await b.getByTestId('setup-cloud').click()
  await b.getByTestId('cloud-entry-code').fill(invite.toLowerCase())
  await b.getByTestId('cloud-entry-email').fill('ela@exemplo.com')
  await b.getByTestId('cloud-entry-password').fill(PW_B)
  await b.getByTestId('cloud-entry-password2').fill(PW_B)
  await noHorizontalOverflow(b)
  await shot(b, '21-entrar-pela-nuvem', info.project.name)
  await b.getByTestId('cloud-entry-submit').click()
  await expect(b.getByTestId('app')).toBeVisible({ timeout: 20_000 })
  await expect(b.locator('[data-testid="viewer-B"]:visible')).toHaveAttribute('aria-checked', 'true')

  // dados do casal desceram; presente do Lucas não; aba pessoal dele em leitura
  await goTab(b, 'financas')
  await expect(b.getByTestId('couple-list')).toContainText('Supermercado')
  await b.getByTestId('fin-PARTNER').click()
  await expect(b.getByTestId('personal-list')).toContainText('Café com o time')
  await expect(b.getByText('Colar de presente')).toHaveCount(0)

  // neste aparelho o Lucas não entra: ele usa o próprio
  await b.locator('[data-testid="viewer-A"]:visible').click()
  await expect(b.getByTestId('login-absent')).toBeVisible()
  await b.getByTestId('login-person-B').click()
  await b.getByTestId('login-password').fill(PW_B)
  await b.getByTestId('login-submit').click()
  await expect(b.getByTestId('app')).toBeVisible({ timeout: 15_000 })

  // ---- Lucas lança um gasto do casal; ela recebe ao sincronizar
  await page.locator('[data-testid="dock-expense"]:visible, [data-testid="side-quick-expense"]:visible').first().click()
  await sheet.getByTestId('expense-amount').pressSequentially('8000')
  await sheet.getByTestId('expense-description').fill('Pizza de sexta')
  await sheet.getByTestId('expense-save').click()
  const rows = (t: string) => [...(server.tables.get(t)?.values() ?? [])]
  await expect.poll(() => rows('transactions').some((r) => r.description === 'Pizza de sexta'), { timeout: 20_000 }).toBe(true)

  await goTab(b, 'ajustes')
  await expect(b.getByTestId('cloud-section')).toContainText('Conectado como ela@exemplo.com')
  await b.getByTestId('cloud-sync').click()
  await goTab(b, 'financas')
  await b.getByTestId('fin-US').click()
  await expect(b.getByTestId('couple-list')).toContainText('Pizza de sexta', { timeout: 15_000 })

  // ---- Lucas fecha a aba pessoal: o servidor para de entregar e o aparelho dela apaga as cópias
  await goTab(page, 'financas')
  await page.getByTestId('fin-MINE').click()
  await page.getByTestId('share-toggle').click()
  await expect.poll(() => rows('profiles').find((r) => r.id === 'A')?.share_personal_finances, { timeout: 20_000, message: 'falhas: ' + server.failures.join(' | ') }).toBe(false)
  await goTab(b, 'ajustes')
  await expect(b.getByTestId('cloud-section')).toContainText('Conectado como ela@exemplo.com')
  await b.getByTestId('cloud-sync').click()
  await goTab(b, 'financas')
  await b.getByTestId('fin-PARTNER').click()
  await expect(b.getByTestId('personal-closed')).toBeVisible({ timeout: 15_000 })
  await expect(b.getByText('Café com o time')).toHaveCount(0)

  expect(errorsB).toEqual([])
  await ctxB.close()
})

test('nuvem: convite errado e senha errada dão erro claro, sem criar nada local', async ({ page, errors }) => {
  void errors
  const server = new FakeSupabase()
  await server.attach(page.context())
  await page.goto('/')
  await page.getByTestId('setup-cloud').click()
  await page.getByTestId('cloud-entry-code').fill('AAAAA-BBBBB')
  await page.getByTestId('cloud-entry-email').fill('x@exemplo.com')
  await page.getByTestId('cloud-entry-password').fill(PW_B)
  await page.getByTestId('cloud-entry-password2').fill(PW_B)
  await page.getByTestId('cloud-entry-submit').click()
  await expect(page.getByRole('alert')).toContainText('Convite inválido')

  await page.getByTestId('cloud-entry-signin').click()
  await page.getByTestId('cloud-entry-password').fill('senha errada demais')
  await page.getByTestId('cloud-entry-submit').click()
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos')
  expect(await page.evaluate(() => localStorage.getItem('ampara:vault:v1'))).toBeNull()
  await expect(page.getByTestId('app')).toHaveCount(0)
})
