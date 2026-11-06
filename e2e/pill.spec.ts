import { at, expect, goTab, noHorizontalOverflow, open, setViewer, shot, test } from './fixtures'

/** Anticoncepcional em cartela (relógio fixo: 2026-11-05) */
test('cartela: comprimido do dia, pausa sem lembrete e aviso da cartela nova', async ({ page, errors }, info) => {
  void errors
  test.setTimeout(60_000)
  await at(page, '10:00')
  await open(page)
  await setViewer(page, 'B')

  // exemplo: cartela 21 + 7 começou há 10 dias
  await goTab(page, 'rotinas')
  const seedPill = page.getByTestId('med-settings').filter({ hasText: 'Anticoncepcional' })
  await expect(seedPill.getByTestId('pack-line')).toContainText('Comprimido 11 de 21')

  // nova cartela 24 + 4 que começou em 09/10: hoje é o último dia da pausa
  await page.getByTestId('add-med').click()
  const sheet = page.getByTestId('sheet-newMed')
  await sheet.getByTestId('new-med-name').fill('Pílula nova')
  await sheet.getByTestId('new-med-dosage').fill('1 comprimido')
  await sheet.getByTestId('new-med-pack').click()
  await sheet.getByRole('radio', { name: /24 \+ 4/ }).click()
  await sheet.getByTestId('new-med-pack-start').fill('2026-10-09')
  await sheet.getByTestId('new-med-stock').fill('24')
  await noHorizontalOverflow(page)
  await shot(page, '40-cartela-gaveta', info.project.name)
  await sheet.getByTestId('new-med-save').click()
  await expect(sheet).toBeHidden()

  const card = page.getByTestId('med-settings').filter({ hasText: 'Pílula nova' })
  await expect(card.getByTestId('pack-line')).toHaveAttribute('data-pause', 'true')
  await expect(card.getByTestId('pack-line')).toContainText('Pausa · dia 4 de 4')
  // na pausa não existe dose
  await expect(page.locator('[data-testid="dose-card"][data-med="Pílula nova"]')).toHaveCount(0)
  // 24 comprimidos = 1 cartela = 28 dias
  await expect(card.getByTestId('stock-line')).toContainText('dá para uns 28 dias')
  await card.getByTestId('restock-pack').click()
  await expect(card.getByTestId('stock-line')).toContainText('48 comprimidos')
  await noHorizontalOverflow(page)

  await goTab(page, 'hoje')
  await expect(page.getByTestId('pack-new-tomorrow')).toContainText('Amanhã começa a cartela nova de Pílula nova')

  // cartela pede um horário só
  await goTab(page, 'rotinas')
  await card.getByTestId('med-edit').click()
  await sheet.getByTestId('new-med-time-add').click()
  await sheet.getByTestId('new-med-save').click()
  await expect(sheet.getByRole('alert')).toContainText('um horário só')
})
