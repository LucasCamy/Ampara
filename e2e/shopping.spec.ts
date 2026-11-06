import { at, expect, goTab, noHorizontalOverflow, open, shot, test } from './fixtures'
import { FakeSupabase } from './fake-supabase'

test('lista de compras: captura em uma linha, sem duplicar, carrinho e fim da compra', async ({ page, errors }, info) => {
  void errors
  await at(page, '10:00')
  await open(page)
  await goTab(page, 'nos')
  const input = page.getByTestId('shopping-input')
  const rows = page.getByTestId('shop-row')

  // exemplo: Leite, Café, Pão de forma (mercado) e Sabão de roupa (casa)
  await expect(rows).toHaveCount(4)
  await input.fill('2 kg arroz')
  await input.press('Enter')
  await expect(page.locator('[data-testid="shop-row"][data-title="Arroz"]')).toContainText('2 kg')
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()

  // repetido (sem acento/maiúscula) não entra
  await input.fill('cafe')
  await input.press('Enter')
  await expect(rows).toHaveCount(5)
  await expect(page.getByText('Café já está na lista')).toBeVisible()

  // vazio: erro inline
  await page.getByTestId('shopping-add').click()
  await expect(page.getByTestId('shopping-form').getByRole('alert')).toContainText('Escreva o que falta')

  await page.getByTestId('shop-cat-PHARMACY').click()
  await input.fill('dipirona')
  await input.press('Enter')
  await expect(page.getByTestId('shop-group-PHARMACY')).toContainText('Dipirona')
  await noHorizontalOverflow(page)
  await shot(page, '50-lista-compras', info.project.name)

  // peguei: vai para o carrinho; terminei: sai da lista (com Desfazer)
  await page.getByRole('checkbox', { name: 'Peguei: Leite' }).click()
  await page.getByRole('checkbox', { name: 'Peguei: Arroz' }).click()
  await expect(page.getByTestId('shop-cart')).toContainText('No carrinho · 2')
  await noHorizontalOverflow(page)
  await page.getByTestId('shop-finish').click()
  await expect(page.getByTestId('shop-cart')).toHaveCount(0)
  await expect(rows).toHaveCount(4)
  await page.getByRole('button', { name: 'Desfazer' }).click()
  await expect(page.getByTestId('shop-cart')).toContainText('No carrinho · 2')

  // registrar o gasto já abre a gaveta preenchida
  await page.getByTestId('shop-expense').click()
  await expect(page.getByTestId('sheet-expense').getByTestId('expense-description')).toHaveValue('Compras do mercado')
})

test('lista de compras na nuvem: o que um adiciona aparece no celular do outro', async ({ browser, page, errors }, info) => {
  void errors
  test.skip(!['iphone-390-light', 'desktop-1280-dark'].includes(info.project.name), 'nuvem validada em 2 projetos')
  test.setTimeout(90_000)
  const server = new FakeSupabase()
  await server.attach(page.context())
  const serverRows = () => [...(server.tables.get('shopping_items')?.values() ?? [])]

  await open(page)
  await goTab(page, 'ajustes')
  await page.getByTestId('cloud-email').fill('lucas@exemplo.com')
  await page.getByTestId('cloud-password').fill('cafe com pao na varanda')
  await page.getByTestId('cloud-submit').click()
  const cloud = page.getByTestId('cloud-section')
  await expect(cloud).toContainText('Conectado como lucas@exemplo.com', { timeout: 15_000 })
  const invite = (await cloud.locator('.font-data').filter({ hasText: /^[A-Z2-9]{5}-[A-Z2-9]{5}$/ }).textContent())?.trim() ?? ''
  await expect.poll(() => serverRows().length, { timeout: 20_000 }).toBe(4)

  const ctxB = await browser.newContext({ viewport: page.viewportSize() ?? undefined })
  await server.attach(ctxB)
  const b = await ctxB.newPage()
  await b.goto('/')
  await b.getByTestId('setup-cloud').click()
  await b.getByTestId('cloud-entry-code').fill(invite)
  await b.getByTestId('cloud-entry-email').fill('ela@exemplo.com')
  await b.getByTestId('cloud-entry-password').fill('cha de hortela no jardim')
  await b.getByTestId('cloud-entry-password2').fill('cha de hortela no jardim')
  await b.getByTestId('cloud-entry-submit').click()
  await expect(b.getByTestId('app')).toBeVisible({ timeout: 20_000 })

  // ela pede, ele recebe
  await goTab(b, 'nos')
  await expect(b.getByTestId('shop-row')).toHaveCount(4)
  await b.getByTestId('shopping-input').fill('Absorvente')
  await b.getByTestId('shopping-input').press('Enter')
  await expect.poll(() => serverRows().some((r) => r.title === 'Absorvente'), { timeout: 20_000 }).toBe(true)

  await goTab(page, 'ajustes')
  await page.getByTestId('cloud-sync').click()
  await goTab(page, 'nos')
  const item = page.locator('[data-testid="shop-row"][data-title="Absorvente"]')
  await expect(item).toContainText('pedido por Namorada', { timeout: 15_000 })

  // ele pega no mercado, ela vê no carrinho
  await page.getByRole('checkbox', { name: 'Peguei: Absorvente' }).click()
  await expect.poll(() => serverRows().find((r) => r.title === 'Absorvente')?.checked, { timeout: 20_000 }).toBe(true)
  await goTab(b, 'ajustes')
  await b.getByTestId('cloud-sync').click()
  await goTab(b, 'nos')
  await expect(b.getByTestId('shop-cart')).toContainText('Absorvente', { timeout: 15_000 })
  await expect(b.getByTestId('shop-cart')).toContainText('pego por Lucas')

  expect(server.failures).toEqual([])
  await ctxB.close()
})
