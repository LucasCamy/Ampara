import { at, expect, goSettings, goTab, noHorizontalOverflow, open, PASSWORDS, quick, skipTour, test } from './fixtures'
import { FAKE_URL, FakeSupabase } from './fake-supabase'

test('foco individual fica só com quem iniciou e convite de foco continua chegando ao par', async ({ browser, page, errors }) => {
  void errors
  test.setTimeout(90_000)
  const server = new FakeSupabase()
  await server.attach(page.context())
  await at(page, '10:00')
  await open(page)
  await quick(page, 'task')
  const task = page.getByTestId('sheet-task')
  await task.getByTestId('task-title').fill('Organizar documento reservado')
  await task.getByRole('checkbox', { name: /^Só eu vejo/ }).check()
  await task.getByTestId('task-save').click()
  await expect(task).toBeHidden()
  await quick(page, 'sos')
  await page.getByTestId('sos-self').click()
  const flow = page.getByTestId('unstuck-flow')
  await flow.getByTestId('unstuck-reason-task').click()
  await flow.getByTestId('unstuck-task').filter({ hasText: 'Organizar documento reservado' }).click()
  await flow.getByTestId('unstuck-choice-micro').click()
  await flow.getByTestId('unstuck-micro-input').fill('Separar documento confidencial')
  await page.getByTestId('unstuck-start').click()
  await expect(flow).toBeHidden()
  await expect(page.getByTestId('focus-card')).toContainText('Separar documento confidencial')

  await goSettings(page, 'nuvem')
  await page.getByTestId('cloud-email').fill('foco-a@ampara.local')
  await page.getByTestId('cloud-password').fill(PASSWORDS.A)
  await page.getByTestId('cloud-submit').click()
  const cloud = page.getByTestId('cloud-section')
  await expect(cloud).toContainText('Conectado como foco-a@ampara.local', { timeout: 15_000 })
  const invite = (await cloud.locator('.font-data').filter({ hasText: /^[A-Z2-9]{5}-[A-Z2-9]{5}$/ }).textContent())?.trim() ?? ''
  expect(invite).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
  const focusRows = () => [...(server.tables.get('focus_sessions')?.values() ?? [])]
  await expect.poll(() => focusRows().find((row) => row.title === 'Separar documento confidencial'), { timeout: 20_000 }).toMatchObject({ started_by: 'A', joined_by: 'A' })

  const other = await browser.newContext({ viewport: page.viewportSize() ?? undefined, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  try {
    await server.attach(other)
    const partner = await other.newPage()
    const partnerErrors: string[] = []
    partner.on('pageerror', (error) => partnerErrors.push(String(error)))
    await at(partner, '10:00')
    await skipTour(partner)
    await partner.goto('/')
    await partner.getByTestId('setup-cloud').click()
    await partner.getByTestId('cloud-entry-code').fill(invite)
    await partner.getByTestId('cloud-entry-email').fill('foco-b@ampara.local')
    await partner.getByTestId('cloud-entry-password').fill(PASSWORDS.B)
    await partner.getByTestId('cloud-entry-password2').fill(PASSWORDS.B)
    await partner.getByTestId('cloud-entry-submit').click()
    await expect(partner.getByTestId('app')).toBeVisible({ timeout: 20_000 })
    await goTab(partner, 'nos')
    await expect(partner.getByTestId('focus-card')).toHaveCount(0)
    const user = server.users.get('foco-b@ampara.local')!
    const token = [...server.access].find(([, session]) => session.userId === user.id)![0]
    const payload = await partner.evaluate(async ({ url, token }) => {
      const response = await fetch(`${url}/rest/v1/focus_sessions?select=*`, { headers: { apikey: 'anon-key-de-teste', Authorization: `Bearer ${token}` } })
      return response.json() as Promise<Record<string, unknown>[]>
    }, { url: FAKE_URL, token })
    expect(JSON.stringify(payload)).not.toContain('Separar documento confidencial')
    expect(JSON.stringify(payload)).not.toContain('Organizar documento reservado')

    // Um convite explícito continua visível, com o fluxo de entrada do par preservado.
    await goTab(page, 'nos')
    await page.getByTestId('focus-card').getByTestId('focus-cancel').click()
    await page.getByTestId('focus-title').fill('Organizar a cozinha juntos')
    await page.getByTestId('focus-start').click()
    await expect.poll(() => focusRows().some((row) => row.title === 'Organizar a cozinha juntos'), { timeout: 15_000 }).toBe(true)
    await goSettings(partner, 'nuvem')
    await partner.getByTestId('cloud-sync').click()
    await goTab(partner, 'nos')
    const shared = partner.getByTestId('focus-card')
    await expect(shared).toContainText('Organizar a cozinha juntos', { timeout: 15_000 })
    await shared.getByTestId('focus-join').click()
    await expect(shared.getByTestId('focus-join')).toHaveCount(0)
    await expect.poll(() => focusRows().find((row) => row.title === 'Organizar a cozinha juntos')?.joined_by, { timeout: 15_000 }).toBe('B')
    await noHorizontalOverflow(partner)
    expect(partnerErrors).toEqual([])
    expect(server.failures).toEqual([])
    expect(server.anonWrites).toBe(0)
  } finally {
    await other.close()
  }
})
