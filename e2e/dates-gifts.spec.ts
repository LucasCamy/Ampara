import { at, expect, goTab, noHorizontalOverflow, open, setViewer, shot, test } from './fixtures'

/** Exemplo do seed (relógio 2026-11-05): namoro faz 3 anos em 10/11; ideia de presente só do Lucas */
test('datas especiais e presentes: lembrete, compra escondida e surpresa preservada', async ({ page, errors }, info) => {
  void errors
  test.setTimeout(60_000)
  await at(page, '10:00')
  await open(page)

  const card = page.getByTestId('special-today')
  await expect(card).toContainText('Faltam 5 dias')
  await expect(card).toContainText('3 anos de namoro')
  await expect(card).toContainText('Você tem 1 ideia guardada para essa data')
  await noHorizontalOverflow(page)

  await goTab(page, 'nos')
  await expect(page.getByTestId('special-row').first()).toHaveAttribute('data-soon', 'true')
  const gift = page.getByTestId('gift-row').filter({ hasText: 'Colar com pingente de lua' })
  await expect(gift).toContainText('Para: Aniversário de namoro')
  await gift.scrollIntoViewIfNeeded()
  await noHorizontalOverflow(page)
  await shot(page, '60-datas-presentes', info.project.name)

  // Comprei: o gasto já abre como pessoal + presente
  await gift.getByTestId('gift-bought').click()
  const sheet = page.getByTestId('sheet-expense')
  await expect(sheet.getByTestId('expense-description')).toHaveValue('Colar com pingente de lua')
  await expect(sheet.getByTestId('expense-gift')).toHaveAttribute('aria-checked', 'true')
  await sheet.getByTestId('expense-amount').pressSequentially('18900')
  await sheet.getByTestId('expense-save').click()
  await expect(sheet).toBeHidden()
  await expect(gift).toHaveAttribute('data-status', 'BOUGHT')

  // nova data: outra data, amanhã faz 2 anos
  await page.getByTestId('special-add').click()
  const sd = page.getByTestId('sheet-specialDate')
  await sd.getByRole('radio', { name: /Outra data/ }).click()
  await sd.getByTestId('special-title').fill('Primeiro encontro')
  await sd.getByTestId('special-date').fill('2024-11-06')
  await sd.getByTestId('special-save').click()
  await expect(sd).toBeHidden()
  const encontro = page.getByTestId('special-row').filter({ hasText: 'Primeiro encontro' })
  await expect(encontro).toContainText('Primeiro encontro · 2 anos')
  await expect(encontro).toContainText('amanhã')

  // ideia nova, sem data
  await page.getByTestId('gift-add').click()
  const gs = page.getByTestId('sheet-gift')
  await gs.getByTestId('gift-save').click()
  await expect(gs.getByRole('alert')).toContainText('Escreva a ideia')
  await gs.getByTestId('gift-title').fill('Livro da autora favorita')
  await gs.getByTestId('gift-save').click()
  await expect(gs).toBeHidden()
  await expect(page.getByTestId('gift-row')).toHaveCount(2)

  // ela: vê as datas, nunca os presentes dele
  await setViewer(page, 'B')
  await goTab(page, 'hoje')
  await expect(page.getByTestId('special-today').first()).toContainText('Ainda sem ideia de presente?')
  await goTab(page, 'nos')
  await expect(page.getByTestId('special-row')).toHaveCount(3)
  await expect(page.getByTestId('gift-row')).toHaveCount(0)
  await expect(page.getByText('Colar com pingente de lua')).toHaveCount(0)
  await goTab(page, 'financas')
  await expect(page.getByText('Colar com pingente de lua')).toHaveCount(0)
})
