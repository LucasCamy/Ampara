import { execFileSync } from 'node:child_process'
import { expect, goTab, noHorizontalOverflow, open, skipTour, test, goSettings } from './fixtures'

/**
 * Dois aparelhos contra o Supabase real do Docker. Confere a interface E o que ficou gravado no Postgres.
 * Só roda por playwright.local.config.ts (npm run e2e:local), com `npm run db:up` antes.
 */

/** Consulta direta no Postgres do compose (como superusuário, ignora RLS: é a visão do banco) */
function sql(query: string): string {
  return execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', query], {
    encoding: 'utf8',
  }).trim()
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`

const PW_CLOUD_A = 'cafe com pao na varanda'
const PW_B = 'cha de hortela no jardim'

test('Supabase real: cria conta, sobe os dados, pareia o segundo aparelho e respeita a privacidade', async ({ browser, page, errors }, info) => {
  void errors
  test.setTimeout(120_000)
  const run = `${info.project.name}-${Date.now()}`
  const emailA = `lucas-${run}@ampara.local`
  const emailB = `ela-${run}@ampara.local`

  // ---- Aparelho do Lucas: espaço local + presente secreto, depois conecta a nuvem
  await open(page)
  await page.locator('[data-testid="dock-expense"]:visible, [data-testid="side-quick-expense"]:visible').first().click()
  const sheet = page.getByTestId('sheet-expense')
  await sheet.getByTestId('expense-amount').pressSequentially('25000')
  await sheet.getByTestId('expense-description').fill('Colar de presente')
  await sheet.getByRole('radio', { name: 'Só meu' }).click()
  await sheet.getByTestId('expense-gift').click()
  await sheet.getByTestId('expense-save').click()
  await expect(sheet).toBeHidden()

  await goSettings(page, 'nuvem')
  await page.getByTestId('cloud-email').fill(emailA)
  await page.getByTestId('cloud-password').fill(PW_CLOUD_A)
  await page.getByTestId('cloud-submit').click()
  const cloud = page.getByTestId('cloud-section')
  await expect(cloud).toContainText(`Conectado como ${emailA}`, { timeout: 20_000 })
  const invite = (await cloud.locator('.font-data').filter({ hasText: /^[A-Z2-9]{5}-[A-Z2-9]{5}$/ }).textContent())?.trim() ?? ''
  expect(invite).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
  await expect(page.locator('[data-testid="sync-pill"]:visible')).toHaveAttribute('data-state', 'ok', { timeout: 30_000 })

  // ---- No banco: conta criada no auth.users, espaço, membro A e todos os dados do aparelho
  const userA = sql(`select id from auth.users where email = ${lit(emailA)}`)
  expect(userA, 'conta do Lucas no auth.users').toMatch(/^[0-9a-f-]{36}$/)
  const couple = sql(`select couple_id from couple_members where user_id = ${lit(userA)} and partner_id = 'A'`)
  expect(couple, 'Lucas é o Parceiro A do espaço').not.toBe('')
  const count = (table: string, extra = '') => Number(sql(`select count(*) from ${table} where couple_id = ${lit(couple)} ${extra}`))
  await expect.poll(() => count('transactions', `and description = 'Colar de presente' and is_secret_gift`), { timeout: 20_000 }).toBe(1)
  const inserted = Object.fromEntries(
    ['profiles', 'tasks', 'events', 'medications', 'medication_logs', 'transactions'].map((t) => [t, count(t)]),
  )
  console.log(`[${info.project.name}] linhas gravadas no Postgres para o espaço ${couple}:`, JSON.stringify(inserted))
  expect(inserted.profiles).toBe(2)
  for (const t of ['tasks', 'events', 'medications', 'transactions']) expect(inserted[t], `${t} no Postgres`).toBeGreaterThan(0)
  // o convite nunca vai em texto claro
  expect(sql(`select count(*) from couple_invites where couple_id = ${lit(couple)} and used_at is null`)).toBe('1')
  expect(sql(`select coalesce(invite_code, '') from couples where id = ${lit(couple)}`)).toBe('')
  expect(sql(`select count(*) from couple_invites where code_hash like ${lit('%' + invite.replace('-', '') + '%')}`)).toBe('0')

  // ---- Aparelho da Namorada: contexto novo (outro celular), entra pelo convite
  const ctxB = await browser.newContext({ viewport: page.viewportSize() ?? undefined, colorScheme: 'dark', locale: 'pt-BR' })
  const b = await ctxB.newPage()
  const errorsB: string[] = []
  b.on('pageerror', (e) => errorsB.push(String(e)))
  b.on('console', (m) => m.type() === 'error' && errorsB.push(m.text()))
  await skipTour(b)
  await b.goto('/')
  await b.getByTestId('setup-cloud').click()
  await b.getByTestId('cloud-entry-code').fill(invite.toLowerCase())
  await b.getByTestId('cloud-entry-email').fill(emailB)
  await b.getByTestId('cloud-entry-password').fill(PW_B)
  await b.getByTestId('cloud-entry-password2').fill(PW_B)
  await b.getByTestId('cloud-entry-submit').click()
  await expect(b.getByTestId('app')).toBeVisible({ timeout: 30_000 })
  await expect(b.locator('[data-testid="viewer-B"]:visible')).toHaveAttribute('aria-checked', 'true')
  await noHorizontalOverflow(b)

  const userB = sql(`select id from auth.users where email = ${lit(emailB)}`)
  expect(sql(`select partner_id from couple_members where user_id = ${lit(userB)} and couple_id = ${lit(couple)}`)).toBe('B')
  expect(sql(`select count(*) from couple_invites where couple_id = ${lit(couple)} and used_at is not null`)).toBe('1')

  // dados do casal desceram do Postgres; o presente do Lucas não (RLS)
  await goTab(b, 'financas')
  await expect(b.getByTestId('couple-list')).toContainText('Supermercado')
  await expect(b.getByText('Colar de presente')).toHaveCount(0)

  // ---- Ela lança um gasto do casal; vai para o Postgres e chega ao aparelho do Lucas
  await b.locator('[data-testid="dock-expense"]:visible, [data-testid="side-quick-expense"]:visible').first().click()
  const sheetB = b.getByTestId('sheet-expense')
  await sheetB.getByTestId('expense-amount').pressSequentially('8000')
  await sheetB.getByTestId('expense-description').fill('Pizza de sexta')
  await sheetB.getByTestId('expense-save').click()
  await expect(sheetB).toBeHidden()
  await expect
    .poll(() => sql(`select created_by || ':' || amount_cents || ':' || scope from transactions where couple_id = ${lit(couple)} and description = 'Pizza de sexta'`), { timeout: 20_000 })
    .toBe('B:8000:COUPLE')

  await goSettings(page, 'nuvem')
  await page.getByTestId('cloud-sync').click()
  await goTab(page, 'financas')
  await page.getByTestId('fin-US').click()
  await expect(page.getByTestId('couple-list')).toContainText('Pizza de sexta', { timeout: 20_000 })

  // ---- Aba pessoal do Lucas: começa aberta (exemplo), ele fecha e depois reabre
  const shareA = () => sql(`select share_personal_finances from profiles where couple_id = ${lit(couple)} and id = 'A'`)
  const syncB = async () => {
    await goSettings(b, 'nuvem')
    await b.getByTestId('cloud-sync').click()
    await goTab(b, 'financas')
    await b.getByTestId('fin-PARTNER').click()
  }
  expect(shareA()).toBe('t')
  await syncB()
  await expect(b.getByTestId('personal-list')).toContainText('Café com o time')

  await page.getByTestId('fin-MINE').click()
  await page.getByTestId('share-toggle').click() // fecha
  await expect.poll(shareA, { timeout: 20_000 }).toBe('f')
  await syncB()
  await expect(b.getByTestId('personal-closed')).toBeVisible({ timeout: 20_000 })
  await expect(b.getByText('Café com o time')).toHaveCount(0)

  await page.getByTestId('share-toggle').click() // reabre
  await expect.poll(shareA, { timeout: 20_000 }).toBe('t')
  await syncB()
  // os lançamentos antigos voltam (não mudaram no servidor: o pull precisa rebaixar), o presente nunca
  await expect(b.getByTestId('personal-list')).toContainText('Café com o time', { timeout: 20_000 })
  await expect(b.getByText('Colar de presente')).toHaveCount(0)

  // sem laço de sincronização: com os dois aparelhos parados, quase nenhuma requisição em 5 s
  const reqs: string[] = []
  const onReq = (r: { url: () => string }) => r.url().includes('/rest/v1/') && reqs.push(r.url())
  page.on('request', onReq)
  b.on('request', onReq)
  await page.waitForTimeout(5_000)
  expect(reqs.length, 'requisições em 5 s ocioso').toBeLessThan(20)

  expect(errorsB).toEqual([])
  await ctxB.close()
})
