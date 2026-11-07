import { expect, goTab, open, test } from './fixtures'

/** Carregamento das abas sob demanda: esqueleto com a forma da tela, offline depois do pré-carregamento */
test('aba carregando mostra esqueleto; depois de aberto, as abas funcionam sem internet', async ({ browser, page, errors }, info) => {
  void errors
  test.skip(!['iphone-390-light', 'desktop-1280-dark'].includes(info.project.name), 'carregamento validado em 2 projetos')

  // rede lenta só para o código das Finanças: o esqueleto aparece no lugar da tela
  await page.route('**/assets/FinanceScreen-*.js', async (r) => {
    await new Promise((res) => setTimeout(res, 1200))
    await r.continue()
  })
  await page.addInitScript(() => {
    // sem pré-carregamento neste aparelho, para ver o carregamento sob demanda
    ;(window as Window & { requestIdleCallback?: unknown }).requestIdleCallback = () => 0
  })
  await open(page)
  await goTab(page, 'financas')
  await expect(page.getByTestId('screen-skeleton')).toBeVisible()
  await expect(page.getByTestId('screen-skeleton')).toHaveAttribute('aria-busy', 'true')
  await expect(page.getByTestId('balance-card')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('screen-skeleton')).toHaveCount(0)

  // outro aparelho: abre, espera o pré-carregamento ocioso e fica sem internet
  const ctx = await browser.newContext({ viewport: page.viewportSize() ?? undefined, reducedMotion: 'reduce' })
  const p2 = await ctx.newPage()
  await open(p2)
  await p2.waitForTimeout(2500)
  await ctx.setOffline(true)
  for (const tab of ['agenda', 'nos', 'rotinas', 'financas', 'ajustes'] as const) {
    await goTab(p2, tab)
    await expect(p2.getByTestId('screen-skeleton')).toHaveCount(0)
  }
  await expect(p2.getByTestId('settings-group-aparelho')).toBeVisible()

  // movimento reduzido: o esqueleto não pulsa
  const anim = await p2.evaluate(() => {
    const el = document.createElement('span')
    el.className = 'block rounded-[14px] bg-subtle motion-safe:animate-pulse'
    document.body.appendChild(el)
    const name = getComputedStyle(el).animationName
    el.remove()
    return name
  })
  expect(anim).toBe('none')
  await ctx.close()
})
