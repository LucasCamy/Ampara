import { at, expect, goTab, noHorizontalOverflow, open, setViewer, shot, test, skipTour } from './fixtures'
import { FakeSupabase } from './fake-supabase'

/**
 * Ciclo menstrual: dado de saúde com privacidade escolhida pela dona.
 * Exemplo do seed: a Namorada (B) está no dia 23 de 28, compartilhando "Só o aviso".
 */

test('ciclo: aviso gentil para o par, sugestão de bateria, registro e privacidade', async ({ page, errors }, info) => {
  void errors
  test.setTimeout(60_000)
  await at(page, '10:00')
  await open(page)

  // ---- Lucas vê só a semana de mais cuidado, sem as datas da menstruação
  const warn = page.getByTestId('partner-cycle-warn')
  await expect(warn).toContainText('Namorada está na semana de mais cuidado')
  await goTab(page, 'rotinas')
  const partnerCard = page.getByTestId('partner-cycle')
  await expect(partnerCard).toContainText('Semana de mais cuidado até')
  await expect(partnerCard).not.toContainText('Dia ')
  await expect(page.getByTestId('cycle-intro')).toBeVisible()
  await noHorizontalOverflow(page)

  // ---- Ela: fase pré-menstrual e sugestão de bateria (nada muda sem tocar)
  await setViewer(page, 'B')
  await goTab(page, 'hoje')
  const suggest = page.getByTestId('cycle-suggest')
  await expect(suggest).toContainText('Pré-menstrual')
  await expect(page.getByTestId('partner-cycle-warn')).toHaveCount(0)
  await noHorizontalOverflow(page)
  await shot(page, '30-ciclo-sugestao', info.project.name)
  await page.getByTestId('cycle-suggest-accept').click()
  await expect(suggest).toHaveCount(0)
  await expect(page.locator('[data-testid="energy-MEDIUM"]').first()).toHaveAttribute('aria-checked', 'true')

  await goTab(page, 'rotinas')
  const card = page.getByTestId('cycle-card')
  await expect(card).toHaveAttribute('data-phase', 'PREMENSTRUAL')
  await expect(card).toContainText('Dia 23 do ciclo')
  await expect(page.locator('[data-testid="cycle-share-GENTLE"]')).toHaveAttribute('aria-checked', 'true')
  await card.scrollIntoViewIfNeeded()
  await noHorizontalOverflow(page)
  await shot(page, '31-ciclo-card', info.project.name)

  // ---- Menstruação começou hoje: registro, fim com 1 toque, e registro duplicado recusado
  await page.getByTestId('period-add').click()
  const sheet = page.getByTestId('sheet-period')
  await expect(sheet).toBeVisible()
  await sheet.getByTestId('period-save').click()
  await expect(sheet).toBeHidden()
  await expect(card).toHaveAttribute('data-phase', 'MENSTRUAL')
  await expect(card).toContainText('Dia 1 do ciclo')
  await page.getByTestId('period-end-today').click()
  await expect(page.getByTestId('period-end-today')).toHaveCount(0)
  await expect(page.getByTestId('period-row')).toHaveCount(4)

  await page.getByTestId('period-add').click()
  await expect(sheet.getByTestId('period-start')).toHaveValue('2026-11-05')
  await sheet.getByTestId('period-save').click()
  await expect(sheet.getByRole('alert')).toContainText('perto desta data')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  // ---- "Só eu vejo": o par deixa de ver qualquer coisa
  await page.getByTestId('cycle-share-NONE').click()
  await expect(page.getByTestId('cycle-share-text')).toContainText('não vê nada')
  await setViewer(page, 'A')
  await expect(page.getByTestId('partner-cycle-warn')).toHaveCount(0)
  await goTab(page, 'rotinas')
  await expect(page.getByTestId('partner-cycle')).toHaveCount(0)
})

test('ciclo na nuvem: o servidor só entrega o que a dona liberou', async ({ browser, page, errors }, info) => {
  void errors
  test.skip(!['iphone-390-light', 'desktop-1280-dark'].includes(info.project.name), 'nuvem validada em 2 projetos')
  test.setTimeout(90_000)
  const server = new FakeSupabase()
  await server.attach(page.context())
  const rows = (t: string) => [...(server.tables.get(t)?.values() ?? [])]

  // ---- Aparelho do Lucas conecta (os dados de exemplo dela não sobem deste aparelho)
  await open(page)
  await goTab(page, 'ajustes')
  await page.getByTestId('cloud-email').fill('lucas@exemplo.com')
  await page.getByTestId('cloud-password').fill('cafe com pao na varanda')
  await page.getByTestId('cloud-submit').click()
  const cloud = page.getByTestId('cloud-section')
  await expect(cloud).toContainText('Conectado como lucas@exemplo.com', { timeout: 15_000 })
  const invite = (await cloud.locator('.font-data').filter({ hasText: /^[A-Z2-9]{5}-[A-Z2-9]{5}$/ }).textContent())?.trim() ?? ''
  await expect(page.locator('[data-testid="sync-pill"]:visible')).toHaveAttribute('data-state', 'ok', { timeout: 20_000 })
  expect(rows('cycle_logs')).toEqual([])
  expect(rows('cycle_settings')).toEqual([])

  // ---- Aparelho dela: entra pela nuvem e registra a menstruação de 22 dias atrás com "Tudo"
  const ctxB = await browser.newContext({ viewport: page.viewportSize() ?? undefined })
  await server.attach(ctxB)
  const b = await ctxB.newPage()
  const errorsB: string[] = []
  b.on('pageerror', (e) => errorsB.push(String(e)))
  await skipTour(b)
  await b.goto('/')
  await b.getByTestId('setup-cloud').click()
  await b.getByTestId('cloud-entry-code').fill(invite)
  await b.getByTestId('cloud-entry-email').fill('ela@exemplo.com')
  await b.getByTestId('cloud-entry-password').fill('cha de hortela no jardim')
  await b.getByTestId('cloud-entry-password2').fill('cha de hortela no jardim')
  await b.getByTestId('cloud-entry-submit').click()
  await expect(b.getByTestId('app')).toBeVisible({ timeout: 20_000 })

  const d = new Date()
  d.setDate(d.getDate() - 22)
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  await goTab(b, 'rotinas')
  await b.getByTestId('cycle-start').click()
  const sheet = b.getByTestId('sheet-period')
  await sheet.getByTestId('period-start').fill(start)
  await sheet.getByTestId('period-save').click()
  await expect(sheet).toBeHidden()
  await expect(b.getByTestId('cycle-card')).toHaveAttribute('data-phase', 'PREMENSTRUAL')
  await b.getByTestId('cycle-share-FULL').click()
  await expect.poll(() => rows('cycle_settings').find((r) => r.id === 'B')?.share, { timeout: 20_000, message: server.failures.join(' | ') }).toBe('FULL')
  await expect.poll(() => rows('cycle_logs').length, { timeout: 20_000 }).toBe(1)

  // ---- Lucas sincroniza: vê a fase dela
  const sync = async () => {
    await goTab(page, 'ajustes')
    await page.getByTestId('cloud-sync').click()
    await expect(page.locator('[data-testid="sync-pill"]:visible')).toHaveAttribute('data-state', 'ok', { timeout: 20_000 })
  }
  await sync()
  await goTab(page, 'rotinas')
  await expect(page.getByTestId('partner-cycle')).toContainText('Dia 23 · Pré-menstrual', { timeout: 15_000 })

  // ---- Ela fecha ("Só eu vejo"): a linha no servidor não diz mais nada e o Lucas deixa de ver
  await b.getByTestId('cycle-share-NONE').click()
  await expect.poll(() => rows('cycle_settings').find((r) => r.id === 'B')?.share, { timeout: 20_000 }).toBe('NONE')
  const closed = rows('cycle_settings').find((r) => r.id === 'B')!
  expect([closed.sensitive_from, closed.sensitive_to, closed.cycle_days]).toEqual([null, null, 28])
  await sync()
  await goTab(page, 'hoje')
  await expect(page.getByTestId('partner-cycle-warn')).toHaveCount(0, { timeout: 15_000 })
  await goTab(page, 'rotinas')
  await expect(page.getByTestId('partner-cycle')).toHaveCount(0)

  expect(server.failures).toEqual([])
  expect(server.anonWrites).toBe(0)
  expect(errorsB).toEqual([])
  await ctxB.close()
})
