import { at, expect, goSettings, noHorizontalOverflow, open, shot, test } from './fixtures'

// O relógio falso pula minutos de uma vez e a animação de entrada/saída (motion) fica no meio do caminho.
// Aqui o que importa é o comportamento: movimento reduzido deixa entrada e saída instantâneas (o app respeita).
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('aviso de remédio chega na hora com o app aberto e confirma pelo próprio aviso', async ({ page, errors }, info) => {
  void errors
  await at(page, '07:58')
  await open(page)
  await expect(page.getByTestId('alert')).toHaveCount(0)

  await page.clock.fastForward('03:00')
  const alert = page.locator('[data-testid="alert"][data-category="med"]')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('Remédio · 08:00')
  await expect(alert).toContainText('Hora do remédio: Venvanse 30mg')
  await expect(alert.getByTestId('alert-action-water')).toBeVisible()
  await noHorizontalOverflow(page)
  await shot(page, '90-aviso-remedio', info.project.name)

  await alert.getByTestId('alert-action-take').click()
  await expect(page.getByTestId('toast').last()).toContainText(/Tomado às 08:0\d/)
  await expect(page.getByTestId('alert')).toHaveCount(0)
})

test('Ajustes > Avisos: ouvir cada tipo, desligar uma categoria e horário de silêncio', async ({ page, errors }, info) => {
  void errors
  await at(page, '12:58')
  await open(page)
  await goSettings(page, 'aparelho')
  const section = page.getByTestId('alerts-section')
  await expect(section).toBeVisible()

  await section.getByTestId('alert-listen-help').click()
  await expect(page.locator('[data-testid="alert"][data-category="help"]')).toContainText('Seu par pediu ajuda')
  await section.getByTestId('alert-listen-water').click()
  await expect(page.locator('[data-testid="alert"][data-category="med"]')).toContainText('Pegou a água?')
  await noHorizontalOverflow(page)
  await shot(page, '91-ajustes-avisos', info.project.name)

  // remédio desligado: a Vitamina D das 13:00 não vira aviso
  const med = section.getByTestId('alert-toggle-med')
  await med.click()
  await expect(med).toHaveAttribute('aria-checked', 'false')
  await section.getByTestId('alert-volume-low').click()
  await expect(section.getByTestId('alert-volume-low')).toHaveAttribute('aria-checked', 'true')

  await section.getByTestId('alert-quiet').click()
  await section.getByTestId('alert-quiet-start').fill('12:00')
  await section.getByTestId('alert-quiet-end').fill('14:00')
  await expect(section).toContainText('Em silêncio agora')
  await expect(section.getByTestId('alert-quiet-help')).toHaveAttribute('aria-checked', 'true')

  // esperar os exemplos sumirem e passar das 13:00
  await page.clock.fastForward('03:00')
  await expect(page.locator('[data-testid="alert"][data-category="med"]')).toHaveCount(0)

  // vale depois de recarregar (preferência do aparelho)
  await page.reload()
  await expect(page.locator('[data-testid="login-form"], [data-testid="app"]').first()).toBeVisible()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ampara:alerts') ?? '{}'))
  expect(stored).toMatchObject({ enabled: { med: false }, volume: 'LOW', quiet: { on: true, start: '12:00', end: '14:00', helpBreaks: true } })
})
