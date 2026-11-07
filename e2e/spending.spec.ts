import { at, expect, goTab, noHorizontalOverflow, open, quick, setViewer, shot, test } from './fixtures'

/** "Para onde foi" (relógio 2026-11-05; exemplo: Supermercado 300, Energia 200, Delivery 120 do casal) */
test('para onde foi: categorias ranqueadas, comparação e presente fora da visão do par', async ({ page, errors }, info) => {
  void errors
  test.setTimeout(60_000)
  await at(page, '10:00')
  await open(page)
  await goTab(page, 'financas')

  const couple = page.getByTestId('spend-couple')
  await expect(couple).toContainText('R$ 620,00 no total')
  await expect(couple.getByTestId('spend-row').first()).toHaveAttribute('data-category', 'MARKET')
  await expect(couple.getByTestId('spend-row').nth(0)).toContainText('R$ 300,00 · 48%')
  await expect(couple.getByTestId('spend-row').nth(1)).toHaveAttribute('data-category', 'HOME')
  await expect(couple).toContainText('sem gastos em outubro para comparar')
  await noHorizontalOverflow(page)
  await shot(page, '97-para-onde-foi', info.project.name)

  // mês anterior sem gasto: mensagem clara
  await page.getByTestId('month-prev').click()
  await expect(couple).toContainText('Nenhum gasto pago neste mês ainda.')
  await page.getByTestId('month-today').click()

  // com gasto em outubro, a comparação aparece por categoria e no total
  await quick(page, 'expense')
  const feira = page.getByTestId('sheet-expense')
  await feira.getByTestId('expense-amount').pressSequentially('20000')
  await feira.getByTestId('expense-description').fill('Feira de outubro')
  await feira.getByTestId('expense-date').fill('2026-10-15')
  await feira.getByTestId('expense-save').click()
  await expect(feira).toBeHidden()
  await expect(couple.locator('[data-category="MARKET"]')).toContainText('R$ 100,00 a mais que outubro')
  await expect(couple.locator('[data-category="HOME"]')).toContainText('novo em relação a outubro')
  await expect(couple).toContainText('R$ 420,00 a mais que outubro')

  // um presente secreto dele: conta no resumo dele, nunca no que ela vê
  await quick(page, 'expense')
  const exp = page.getByTestId('sheet-expense')
  await exp.getByTestId('expense-amount').pressSequentially('10000')
  await exp.getByTestId('expense-description').fill('Perfume')
  await exp.getByRole('radio', { name: 'Só meu' }).click()
  await exp.getByRole('radio', { name: /Saúde/ }).click()
  await exp.getByTestId('expense-gift').click()
  await exp.getByTestId('expense-save').click()
  await expect(exp).toBeHidden()
  await page.getByTestId('fin-MINE').click()
  await expect(page.getByTestId('spend-personal').locator('[data-category="HEALTH"]')).toContainText('R$ 100,00')

  await setViewer(page, 'B')
  await goTab(page, 'financas')
  await page.getByTestId('fin-PARTNER').click()
  const his = page.getByTestId('spend-personal')
  await expect(his).toContainText('de Lucas')
  await expect(his.locator('[data-category="LEISURE"]')).toContainText('R$ 59,90')
  await expect(his.locator('[data-category="HEALTH"]')).toHaveCount(0)
  await expect(his).not.toContainText('Perfume')
})
