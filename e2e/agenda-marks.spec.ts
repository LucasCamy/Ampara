import { at, expect, goTab, noHorizontalOverflow, open, setViewer, shot, test } from './fixtures'

/** Agenda única (relógio 2026-11-05): datas especiais e ciclo junto com compromissos e contas */
test('agenda única: data especial, semana de cuidado do par e privacidade do ciclo', async ({ page, errors }, info) => {
  void errors
  test.setTimeout(60_000)
  await at(page, '10:00')
  await open(page)
  await goTab(page, 'agenda')

  // Dia: ela está na semana de mais cuidado (só o aviso: nada de datas da menstruação)
  const marks = page.getByTestId('day-mark')
  await expect(marks.filter({ hasText: 'Semana de mais cuidado de Namorada' })).toHaveCount(1)
  await expect(page.locator('[data-testid="day-mark"][data-kind="PERIOD"]')).toHaveCount(0)

  // Mês: o aniversário de namoro no dia 10, com legenda
  await page.getByTestId('agenda-MONTH').click()
  await page.getByRole('gridcell', { name: /^10 de novembro/ }).click()
  await expect(marks.filter({ hasText: '3 anos de namoro' })).toHaveCount(1)
  await expect(page.getByLabel('Legenda')).toContainText('Data especial')
  await noHorizontalOverflow(page)
  await shot(page, '85-agenda-unica', info.project.name)

  // filtro "Nós": a data do casal fica; o ciclo dela (dela) sai
  await page.getByRole('radio', { name: 'Nós' }).click()
  await expect(marks.filter({ hasText: '3 anos de namoro' })).toHaveCount(1)
  await page.getByRole('gridcell', { name: /^5 de novembro/ }).click()
  await expect(marks.filter({ hasText: 'Semana de mais cuidado' })).toHaveCount(0)

  // ela vê o próprio ciclo, inclusive a próxima menstruação prevista
  await setViewer(page, 'B')
  await goTab(page, 'agenda')
  await page.getByTestId('agenda-MONTH').click()
  await page.getByRole('gridcell', { name: /^11 de novembro/ }).click()
  await expect(marks.filter({ hasText: 'Menstruação prevista' })).toHaveCount(1)
})
