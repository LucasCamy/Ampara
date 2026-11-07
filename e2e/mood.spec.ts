import { at, expect, goTab, noHorizontalOverflow, open, setViewer, shot, showTodayFeed, test } from './fixtures'

/** Exemplo do seed: ela fez check-in "Preciso de colo" e tem a lista do que a acalma */
test('check-in do dia e o que me acalma: o par lê e sabe como ajudar', async ({ page, errors }, info) => {
  void errors
  test.setTimeout(60_000)
  await at(page, '10:00')
  await open(page)

  const partnerMood = page.getByTestId('partner-mood')
  await expect(partnerMood).toContainText('Namorada hoje')
  await expect(partnerMood).toContainText('Preciso de colo')
  await expect(partnerMood).toContainText('Cólica e cabeça cheia')
  await expect(partnerMood.getByTestId('comfort-list')).toContainText('Chá de camomila')
  // o pedido de ajuda dela também mostra o que acalma
  await expect(page.getByTestId('help-request-card').getByTestId('comfort-list')).toContainText('Bolsa de água quente')

  // meu check-in em 1 toque, recado e troca (é o 4º cartão do "Para hoje": fica em "Mais para hoje")
  await showTodayFeed(page)
  await page.getByTestId('mood-LOW_ENERGY').click()
  const done = page.getByTestId('my-mood-done')
  await expect(done).toContainText('Sem energia')
  // coluna estreita (lateral do Hoje no computador): o texto não é espremido; o recado desce para a linha de baixo
  const textBox = await done.locator('p').first().boundingBox()
  const cardBox = await done.boundingBox()
  expect(textBox!.width, 'texto do check-in espremido').toBeGreaterThanOrEqual(Math.min(180, cardBox!.width - 32))
  expect(textBox!.height, 'texto do check-in quebrando palavra por palavra').toBeLessThan(48)
  await done.scrollIntoViewIfNeeded()
  await shot(page, '69-checkin-recado', info.project.name)
  await page.getByTestId('mood-note').fill('Dia puxado no trabalho')
  await page.getByTestId('mood-note-save').click()
  await expect(done).toContainText('Dia puxado no trabalho')
  await noHorizontalOverflow(page)
  await shot(page, '70-checkin', info.project.name)
  await page.getByTestId('mood-change').click()
  await page.getByTestId('mood-GOOD').click()
  await expect(page.getByTestId('mood-GOOD')).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Pronto' }).click()
  await expect(done).toContainText('Bem')

  // a minha lista: adiciona, recusa repetido, tira; a dela só leitura
  await goTab(page, 'nos')
  const section = page.getByTestId('comfort-section')
  await section.getByTestId('comfort-input').fill('Café passado na hora')
  await section.getByTestId('comfort-add').click()
  await expect(section.getByTestId('my-comfort')).toContainText('Café passado na hora')
  await section.getByTestId('comfort-input').fill('caminhar um pouco')
  await section.getByTestId('comfort-add').click()
  await expect(section.getByRole('alert')).toContainText('já está')
  await section.getByRole('button', { name: 'Tirar da lista: Silêncio por 20 minutos' }).click()
  await expect(section.getByTestId('my-comfort')).not.toContainText('Silêncio')
  await expect(section.getByTestId('comfort-list')).toContainText('Ficar abraçados vendo série')
  await noHorizontalOverflow(page)

  // ela vê o meu check-in (bem: sem lista de acalmar)
  await setViewer(page, 'B')
  await goTab(page, 'hoje')
  const mine = page.getByTestId('partner-mood')
  await expect(mine).toContainText('Lucas hoje')
  await expect(mine).toContainText('Bem')
  await expect(mine).toContainText('Dia puxado no trabalho')
  await expect(mine.getByTestId('comfort-list')).toHaveCount(0)
})
