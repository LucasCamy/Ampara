import { readFileSync } from 'node:fs'
import { expect, goTab, noHorizontalOverflow, open, PASSWORDS, test, skipTour } from './fixtures'

test('backup cifrado: baixar com a senha, restaurar num celular novo e entrar', async ({ browser, page, errors }, info) => {
  void errors
  test.skip(!['iphone-390-light', 'desktop-1280-dark'].includes(info.project.name), 'backup validado em 2 projetos')
  test.setTimeout(90_000)
  await open(page)

  // um dado novo, para conferir que foi junto
  await goTab(page, 'nos')
  await page.getByTestId('shopping-input').fill('Pilhas AA')
  await page.getByTestId('shopping-input').press('Enter')
  await expect(page.locator('[data-testid="shop-row"][data-title="Pilhas AA"]')).toHaveCount(1)

  await goTab(page, 'ajustes')
  const section = page.getByTestId('backup-section')
  await section.getByTestId('backup-export-open').click()
  await section.getByTestId('backup-password').fill('senha errada qualquer')
  await section.getByTestId('backup-export').click()
  await expect(section.getByRole('alert')).toContainText('Senha incorreta')
  await section.getByTestId('backup-password').fill(PASSWORDS.A)
  const [download] = await Promise.all([page.waitForEvent('download'), section.getByTestId('backup-export').click()])
  expect(download.suggestedFilename()).toMatch(/^ampara-backup-\d{4}-\d{2}-\d{2}\.ampara$/)
  const path = await download.path()
  const content = readFileSync(path, 'utf8')
  // cifrado: nada do casal nem a senha em texto claro
  expect(content).not.toContain('Pilhas AA')
  expect(content).not.toContain(PASSWORDS.A)
  await noHorizontalOverflow(page)

  // celular novo: arquivo errado, senha errada e, por fim, a certa
  const ctx = await browser.newContext({ viewport: page.viewportSize() ?? undefined })
  const fresh = await ctx.newPage()
  await skipTour(fresh)
  await fresh.goto('/')
  await expect(fresh.getByTestId('setup-form')).toBeVisible({ timeout: 15_000 })
  await fresh.getByTestId('setup-restore').click()
  const form = fresh.getByTestId('restore-form')
  await form.getByTestId('restore-file').setInputFiles({ name: 'foto.ampara', mimeType: 'application/json', buffer: Buffer.from('oi') })
  await expect(form.getByRole('alert')).toContainText('não é um backup do Ampara')
  await form.getByTestId('restore-file').setInputFiles(path)
  await expect(form.getByTestId('restore-info')).toContainText('Lucas e Namorada')
  await form.getByTestId('restore-password').fill('outra senha errada')
  await form.getByTestId('restore-submit').click()
  await expect(form.getByRole('alert')).toContainText('Senha incorreta para este backup', { timeout: 15_000 })
  await noHorizontalOverflow(fresh)
  await form.getByTestId('restore-password').fill(PASSWORDS.A)
  await form.getByTestId('restore-submit').click()

  await expect(fresh.getByTestId('login-form')).toBeVisible({ timeout: 15_000 })
  await fresh.getByTestId('login-password').fill(PASSWORDS.A)
  await fresh.getByTestId('login-submit').click()
  await expect(fresh.getByTestId('app')).toBeVisible({ timeout: 15_000 })
  await goTab(fresh, 'nos')
  await expect(fresh.locator('[data-testid="shop-row"][data-title="Pilhas AA"]')).toHaveCount(1)
  await ctx.close()
})
