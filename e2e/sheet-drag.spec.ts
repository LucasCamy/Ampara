import { expect, open, quick, test, type Page } from './fixtures'

/**
 * Arrasta a partir da alça: distância em px, passos e pausa entre passos. O mouse do Playwright é instantâneo;
 * a pausa dá o ritmo de um dedo (lento = sem pausa curta, rápido = 1 passo).
 */
async function dragHandle(page: Page, dy: number, steps: number, msPerStep = 0) {
  const grab = page.getByTestId('sheet-grab')
  const box = (await grab.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + 10
  await page.mouse.move(x, y)
  await page.mouse.down()
  if (msPerStep) {
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x, y + (dy * i) / steps)
      await page.waitForTimeout(msPerStep)
    }
  } else await page.mouse.move(x, y + dy, { steps })
  await page.mouse.up()
}

const translateY = (page: Page) =>
  page.getByRole('dialog').evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)

test('gaveta no celular: arrastar para baixo fecha, pouco volta, gesto rápido fecha', async ({ page, errors }, info) => {
  void errors
  test.skip(!info.project.name.startsWith('mobile') && !info.project.name.startsWith('iphone'), 'gesto de gaveta é do celular')
  await open(page)
  const sheet = page.getByTestId('sheet-task')

  // pouco: volta para o lugar e continua aberta
  await quick(page, 'task')
  await expect(sheet).toBeVisible()
  await page.waitForTimeout(350)
  await dragHandle(page, 40, 8, 30)
  await page.waitForTimeout(350)
  await expect(sheet).toBeVisible()
  expect(Math.abs(await translateY(page))).toBeLessThan(1)

  // longe (devagar): fecha
  await dragHandle(page, 320, 12, 30)
  await expect(sheet).toBeHidden()

  // gesto rápido e curto: fecha também
  await quick(page, 'task')
  await expect(sheet).toBeVisible()
  await page.waitForTimeout(350)
  await dragHandle(page, 70, 1)
  await expect(sheet).toBeHidden()

  // o X continua funcionando e arrastar a partir dele não move a gaveta
  await quick(page, 'task')
  await page.waitForTimeout(350)
  await sheet.getByRole('button', { name: 'Fechar' }).click()
  await expect(sheet).toBeHidden()
})

test('no computador a gaveta é diálogo: arrastar não fecha', async ({ page, errors }, info) => {
  void errors
  test.skip(!info.project.name.startsWith('desktop-1280'), 'diálogo do computador')
  await open(page)
  await quick(page, 'task')
  const sheet = page.getByTestId('sheet-task')
  await expect(sheet).toBeVisible()
  await page.waitForTimeout(350)
  await dragHandle(page, 320, 12)
  await page.waitForTimeout(300)
  await expect(sheet).toBeVisible()
})
