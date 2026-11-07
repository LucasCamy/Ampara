import { expect, goTab, open, PASSWORDS, test } from './fixtures'

const fireSwMessage = () => (u: string) =>
  navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'OPEN_URL', url: u } }))

test('atualização do app instalado: avisa a versão nova e recarrega; procurar manual', async ({ page, errors }, info) => {
  void errors
  test.skip(!['iphone-390-light', 'desktop-1280-dark'].includes(info.project.name), 'PWA validado em 2 projetos')
  let served = 'igual'
  await page.route('**/version.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: served }) }))
  await open(page)

  // versão atual = a do build; o servidor ainda serve a mesma: nada de aviso, e o manual confirma
  await goTab(page, 'ajustes')
  const current = (await page.getByTestId('app-version').textContent())?.trim() ?? ''
  expect(current).toMatch(/^\d{12}-[a-z0-9]{1,4}$/)
  served = current
  await page.getByTestId('about-check').click()
  await expect(page.getByText('Você já está na versão mais nova')).toBeVisible()
  await expect(page.getByTestId('update-banner')).toHaveCount(0)

  // publicaram outra: o aviso aparece ao voltar para o app e "Atualizar" recarrega
  served = 'versao-nova'
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByTestId('update-banner')).toContainText('Nova versão do Ampara')
  const reload = page.waitForEvent('load')
  await page.getByTestId('update-apply').click()
  await reload
  await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
})

test('notificação com o app aberto ou bloqueado abre a tela certa', async ({ page, errors }, info) => {
  void errors
  test.skip(!['iphone-390-light', 'desktop-1280-dark'].includes(info.project.name), 'PWA validado em 2 projetos')
  await open(page)
  await goTab(page, 'financas')

  // app aberto: lembrete do remédio abre a confirmação
  await page.evaluate(fireSwMessage(), '/?quick=med')
  await expect(page.getByTestId('sheet-med')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('sheet-med')).toBeHidden()

  // atraso do par / pedido de ajuda: vai para o Hoje
  await page.evaluate(fireSwMessage(), '/#/rotinas')
  await expect(page).toHaveURL(/#\/rotinas$/)
  await page.evaluate(fireSwMessage(), '/#/hoje')
  await expect(page).toHaveURL(/#\/hoje$/)

  // app bloqueado: o destino espera o login
  await page.locator('[data-testid="lock"]:visible').first().click()
  await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 15_000 })
  await page.evaluate(fireSwMessage(), '/?quick=med')
  await page.getByTestId('login-password').fill(PASSWORDS.A)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('sheet-med')).toBeVisible({ timeout: 15_000 })
})
