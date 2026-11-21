import { at, expect, goTab, noHorizontalOverflow, PASSWORDS, setEnergy, skipTour, test, type Page } from './fixtures'

async function solo(page: Page) {
  await at(page, '10:00')
  await skipTour(page)
  await page.goto('/')
  await page.getByTestId('setup-mode-solo').click()
  await page.getByTestId('setup-name').fill('Lucas')
  await page.getByTestId('setup-password').fill(PASSWORDS.A)
  await page.getByTestId('setup-password2').fill(PASSWORDS.A)
  await page.getByTestId('setup-submit').click()
  await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
}

test('ideia pronta cria rotina em um toque e Desfazer tira a inclusão', async ({ page, errors }) => {
  void errors
  await solo(page)
  await goTab(page, 'rotinas')
  await page.getByTestId('ideas-routines').click()
  const sheet = page.getByTestId('sheet-templates')
  await sheet.getByTestId('template-routine-water').click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('routine-card').filter({ hasText: 'Beber água' })).toHaveCount(1)
  await page.getByTestId('toast').last().getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(page.getByTestId('routine-card').filter({ hasText: 'Beber água' })).toHaveCount(0)
  await noHorizontalOverflow(page)
})

test('uma sugestão por vez, nenhuma em sobrecarga e dispensa persistida', async ({ page, errors }) => {
  void errors
  await solo(page)
  const card = page.getByTestId('suggestion-card')
  await expect(card).toHaveCount(1)
  const suggestion = await card.getAttribute('data-suggestion-id')
  expect(suggestion).toBeTruthy()
  await setEnergy(page, 'OVERLOAD')
  await expect(card).toHaveCount(0)
  await setEnergy(page, 'MEDIUM')
  await expect(card).toHaveCount(1)
  await card.getByTestId('suggestion-dismiss').click()
  await expect(card).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator(`[data-testid="suggestion-card"][data-suggestion-id="${suggestion}"]`)).toHaveCount(0)
})
