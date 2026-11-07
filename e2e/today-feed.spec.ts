import { at, expect, noHorizontalOverflow, open, setEnergy, shot, test } from './fixtures'

/** Hoje sem parede de cartões: urgente primeiro, "Para hoje" com até 3 à vista */
test('Hoje: urgente no topo, até 3 cartões de "Para hoje" e o resto recolhido', async ({ page, errors }, info) => {
  void errors
  await at(page, '10:00')
  await open(page)

  // o pedido de ajuda dela (urgente) vem antes do Foco do dia e do "Para hoje"
  const order = await page.evaluate(() => ['help-request-card', 'focus-list', 'today-feed'].map((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().top ?? -1))
  expect(order[0]!).toBeGreaterThan(0)
  expect(order[0]!).toBeLessThan(order[1]!)
  expect(order[1]!).toBeLessThan(order[2]!)

  const feed = page.getByTestId('today-feed')
  const total = await feed.locator(':scope > *').count()
  expect(total).toBeGreaterThan(3)
  await expect(feed.locator(':scope > *:visible')).toHaveCount(3)
  const more = page.getByTestId('today-more')
  await expect(more).toHaveText(`Mais para hoje (${total - 3})`)
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await noHorizontalOverflow(page)
  await shot(page, '15-hoje-enxuto', info.project.name)

  await more.click()
  await expect(feed.locator(':scope > *:visible')).toHaveCount(total)
  await expect(more).toHaveText('Mostrar menos')
  await more.click()
  await expect(feed.locator(':scope > *:visible')).toHaveCount(3)

  // modo sobrecarga: só a próxima ação e o pedir ajuda; o resto (urgente primeiro) em "Pode esperar"
  await setEnergy(page, 'OVERLOAD')
  await expect(page.getByTestId('today-overload')).toBeVisible()
  await expect(page.getByTestId('help-request-card')).toBeHidden()
  await page.getByTestId('can-wait').locator('summary').click()
  await expect(page.getByTestId('help-request-card')).toBeVisible()
})
