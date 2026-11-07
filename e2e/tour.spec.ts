import { expect, noHorizontalOverflow, open, setViewer, shot, test, goSettings } from './fixtures'

test('apresentação: uma vez por pessoa, 5 passos, privacidade com o nome do par e rever em Ajustes', async ({ page, errors }, info) => {
  void errors
  test.setTimeout(60_000)
  await open(page, '/', { tour: true })

  const tour = page.getByTestId('tour')
  await expect(tour).toBeVisible()
  await expect(tour).toHaveAttribute('data-step', '1')
  await noHorizontalOverflow(page)
  await shot(page, '05-apresentacao', info.project.name)
  for (let i = 2; i <= 5; i++) {
    await page.getByTestId('tour-next').click()
    await expect(tour).toHaveAttribute('data-step', String(i))
  }
  await expect(tour).toContainText('Ideias de presente nunca aparecem para Namorada')
  await expect(page.getByTestId('tour-next')).toHaveText('Começar')
  await page.getByTestId('tour-next').click()
  await expect(tour).toBeHidden()

  // não volta para quem já viu
  await page.reload()
  await expect(page.getByTestId('app')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(1000)
  await expect(page.getByTestId('tour')).toHaveCount(0)

  // ela, na primeira vez: aparece para ela também; "Pular" fecha
  await setViewer(page, 'B')
  await expect(page.getByTestId('tour')).toBeVisible()
  await expect(page.getByTestId('tour')).toContainText('1 de 5')
  await page.getByTestId('tour-skip').click()
  await expect(page.getByTestId('tour')).toBeHidden()

  // rever quando quiser
  await goSettings(page, 'aparelho')
  await page.getByTestId('tour-again').click()
  await expect(page.getByTestId('tour')).toBeVisible()
})
