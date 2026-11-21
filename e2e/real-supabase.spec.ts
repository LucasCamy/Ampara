import { execFileSync } from 'node:child_process'
import { expect, goTab, noHorizontalOverflow, open, skipTour, test, goSettings, quick, type Page } from './fixtures'

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

const SOLO_ENTITY_TABLES = ['profiles', 'tasks', 'events', 'medications', 'medication_logs', 'transactions', 'help_requests', 'nudges', 'cycle_settings', 'cycle_logs', 'shopping_items', 'special_dates', 'gift_ideas', 'mood_checkins', 'comfort_items', 'focus_sessions', 'savings_goals', 'recurrences'] as const

function soloEntitySnapshot(couple: string): unknown {
  const parts = SOLO_ENTITY_TABLES.map((table) => `select ${lit(table)} as name, coalesce(jsonb_agg(to_jsonb(t) - 'synced_at' order by t.id), '[]'::jsonb) as rows from ${table} t where t.couple_id = ${lit(couple)}`)
  return JSON.parse(sql(`select jsonb_object_agg(name, rows) from (${parts.join(' union all ')}) entities`))
}

async function addReservedExpense(page: Page, description: string) {
  await quick(page, 'expense')
  const sheet = page.getByTestId('sheet-expense')
  await sheet.getByTestId('expense-amount').fill('3900')
  await sheet.getByTestId('expense-description').fill(description)
  await sheet.getByRole('radio', { name: 'Só meu', exact: true }).click()
  await sheet.getByTestId('expense-gift').click()
  await sheet.getByTestId('expense-save').click()
  await expect(sheet).toBeHidden()
}

async function enterRealCloud(page: Page, email: string, password: string, invite?: string) {
  await skipTour(page)
  await page.goto('/')
  await page.getByTestId('setup-cloud').click()
  if (invite) {
    await page.getByTestId('cloud-entry-code').fill(invite)
    await page.getByTestId('cloud-entry-password2').fill(password)
  } else await page.getByTestId('cloud-entry-signin').click()
  await page.getByTestId('cloud-entry-email').fill(email)
  await page.getByTestId('cloud-entry-password').fill(password)
  await page.getByTestId('cloud-entry-submit').click()
  await expect(page.getByTestId('app')).toBeVisible({ timeout: 30_000 })
}

test('Supabase real: B converte o espaço para Solo, revoga A e retoma o mesmo par sem perder registros', async ({ browser, page, errors }, info) => {
  void errors
  test.setTimeout(180_000)
  const run = `${info.project.name}-${Date.now()}`
  const emailA = `converte-a-${run}@ampara.local`
  const emailB = `converte-b-${run}@ampara.local`
  const titleA = 'Reserva pessoal original de A'
  const titleB = 'Reserva pessoal original de B'
  const shoppingTitle = 'Compra preservada no Solo real'
  const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext({ viewport: page.viewportSize() ?? undefined, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })))
  const otherPageErrors: string[] = []
  let couple = ''
  let apiHeaders: Record<string, string> | null = null
  let apiOrigin = ''
  page.on('request', (request) => {
    if (!request.url().endsWith('/rest/v1/rpc/my_membership')) return
    const headers = request.headers()
    if (!headers.authorization || !headers.apikey) return
    apiHeaders = { authorization: headers.authorization, apikey: headers.apikey }
    apiOrigin = new URL(request.url()).origin
  })
  try {
    await open(page)
    await addReservedExpense(page, titleA)
    await goTab(page, 'nos')
    await page.getByTestId('shopping-input').fill(shoppingTitle)
    await page.getByTestId('shopping-input').press('Enter')
    await goSettings(page, 'nuvem')
    await page.getByTestId('cloud-email').fill(emailA)
    await page.getByTestId('cloud-password').fill(PW_CLOUD_A)
    await page.getByTestId('cloud-submit').click()
    const cloud = page.getByTestId('cloud-section')
    await expect(cloud).toContainText(`Conectado como ${emailA}`, { timeout: 20_000 })
    const invite = (await cloud.locator('.font-data').filter({ hasText: /^[A-Z2-9]{5}-[A-Z2-9]{5}$/ }).textContent())?.trim() ?? ''
    expect(invite).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
    await expect(page.locator('[data-testid=sync-pill]:visible')).toHaveAttribute('data-state', 'ok', { timeout: 30_000 })
    couple = sql(`select couple_id from couple_members where user_id = (select id from auth.users where email = ${lit(emailA)}) and revoked_at is null`)
    expect(couple).not.toBe('')

    const b = await contexts[0]!.newPage()
    b.on('pageerror', (error) => otherPageErrors.push(String(error)))
    await enterRealCloud(b, emailB, PW_B, invite)
    await addReservedExpense(b, titleB)
    await expect(b.locator('[data-testid=sync-pill]:visible')).toHaveAttribute('data-state', 'ok', { timeout: 30_000 })
    const before = soloEntitySnapshot(couple)
    await goSettings(b, 'casal')
    await b.getByTestId('conversion-open').click()
    await b.getByTestId('conversion-password').fill(PW_B)
    const pendingBackup = b.waitForEvent('download')
    await b.getByTestId('conversion-submit').click()
    expect((await pendingBackup).suggestedFilename()).toMatch(/^ampara-antes-do-solo-\d{4}-\d{2}-\d{2}\.ampara$/)
    await expect(b.getByText('Só para mim', { exact: true })).toBeVisible({ timeout: 30_000 })
    expect(sql(`select mode || ':' || solo_owner_id from couples where id = ${lit(couple)}`)).toBe('SOLO:B')
    expect(sql(`select count(*) from couple_members where couple_id = ${lit(couple)} and partner_id = 'A' and revoked_at is not null`)).toBe('1')
    expect(sql(`select count(*) from couple_members where couple_id = ${lit(couple)} and partner_id = 'B' and revoked_at is null`)).toBe('1')
    expect(soloEntitySnapshot(couple)).toEqual(before)

    // A conserva um JWT válido, mas a RLS já não entrega linhas nem aceita restaurar o modo.
    expect(apiHeaders).not.toBeNull()
    const denied = await page.request.get(`${apiOrigin}/rest/v1/transactions?couple_id=eq.${encodeURIComponent(couple)}`, { headers: apiHeaders! })
    expect(denied.status()).toBe(200)
    expect(await denied.json()).toEqual([])
    const cannotRestore = await page.request.post(`${apiOrigin}/rest/v1/rpc/restore_couple`, { headers: apiHeaders!, data: {} })
    expect(cannotRestore.status()).toBe(403)
    const syncA = page.getByTestId('cloud-sync')
    if (await syncA.isVisible()) {
      try { await syncA.click({ timeout: 2000 }) } catch (error) { if (!await page.getByTestId('login-form').isVisible()) throw error }
    }
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 20_000 })

    // Aparelho vazio de B: modo e autorias vêm do servidor, sem depender do cofre convertido.
    const next = await contexts[1]!.newPage()
    next.on('pageerror', (error) => otherPageErrors.push(String(error)))
    await enterRealCloud(next, emailB, PW_B)
    await goSettings(next, 'casal')
    await expect(next.getByText('Só para mim', { exact: true })).toBeVisible()
    await expect(next.getByRole('textbox', { name: 'Seu nome', exact: true })).toHaveValue('Namorada')
    await goTab(next, 'nos')
    await expect(next.locator('[data-testid=shop-row]').filter({ hasText: shoppingTitle })).toHaveCount(1)
    await goTab(next, 'financas')
    await expect(next.getByTestId('personal-list')).toContainText(titleB)
    await expect(next.getByText(titleA, { exact: true })).toHaveCount(0)
    await noHorizontalOverflow(next)

    await goSettings(next, 'casal')
    await next.getByTestId('settings-upgrade').click()
    await expect(next.getByTestId('upgrade-original-partner')).toHaveText('Retomar com Lucas')
    await next.getByTestId('upgrade-password').fill(PW_B)
    await next.getByTestId('upgrade-submit').click()
    await expect(next.getByTestId('settings-invite')).toBeVisible({ timeout: 20_000 })
    const renewed = (await next.getByTestId('settings-invite').textContent())?.match(/[A-Z2-9]{5}-[A-Z2-9]{5}/)?.[0] ?? ''
    expect(renewed).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
    await expect.poll(() => sql(`select mode from couples where id = ${lit(couple)}`), { timeout: 20_000 }).toBe('COUPLE')
    await expect.poll(() => sql(`select count(*) from couple_invites where couple_id = ${lit(couple)} and used_at is null`), { timeout: 20_000 }).toBe('1')

    const restored = await contexts[2]!.newPage()
    restored.on('pageerror', (error) => otherPageErrors.push(String(error)))
    await enterRealCloud(restored, emailA, PW_CLOUD_A, renewed)
    expect(sql(`select count(*) from couple_members where couple_id = ${lit(couple)} and partner_id = 'A' and revoked_at is null`)).toBe('1')
    await goTab(restored, 'financas')
    await restored.getByTestId('fin-MINE').click()
    await expect(restored.getByTestId('personal-list')).toContainText(titleA)
    await expect(restored.getByText(titleB, { exact: true })).toHaveCount(0)
    expect(soloEntitySnapshot(couple)).toEqual(before)
    expect(otherPageErrors).toEqual([])
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
    if (couple) sql(`delete from couples where id = ${lit(couple)}`)
    sql(`delete from auth.users where email in (${lit(emailA)},${lit(emailB)})`)
  }
})
