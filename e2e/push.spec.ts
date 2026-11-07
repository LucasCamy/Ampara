import { expect, noHorizontalOverflow, open, shot, test, goSettings } from './fixtures'
import { FakeSupabase } from './fake-supabase'

/**
 * Ativar lembretes. O navegador sem tela não tem serviço de push de verdade: só o pushManager é simulado
 * (registra a chave recebida e devolve uma inscrição). Permissão, service worker, RPCs e o espelho do
 * servidor são reais. O envio e a cifra são testados contra o Postgres real em `npm run push:check`.
 */
test('lembretes no celular: pede nuvem, ativa com a chave do servidor, detalhes opcionais e desliga', async ({ page, errors }, info) => {
  void errors
  test.skip(!['iphone-390-light', 'desktop-1280-dark'].includes(info.project.name), 'push validado em 2 projetos')
  test.setTimeout(90_000)
  await page.context().grantPermissions(['notifications'])
  await page.addInitScript(() => {
    const w = window as unknown as { __push: { key: string | null; subscribed: boolean; unsubscribed: number } }
    w.__push = { key: null, subscribed: false, unsubscribed: 0 }
    const sub = {
      endpoint: 'https://push.exemplo.test/aparelho-do-lucas',
      toJSON: () => ({ endpoint: 'https://push.exemplo.test/aparelho-do-lucas', keys: { p256dh: 'BPchave-publica-do-aparelho', auth: 'segredo-auth' } }),
      unsubscribe: async () => {
        w.__push.subscribed = false
        w.__push.unsubscribed += 1
        return true
      },
    }
    const proto = (window as unknown as { PushManager?: { prototype: Record<string, unknown> } }).PushManager?.prototype
    if (!proto) return
    proto.subscribe = async (opts: { applicationServerKey: Uint8Array }) => {
      w.__push.key = btoa(String.fromCharCode(...new Uint8Array(opts.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      w.__push.subscribed = true
      return sub
    }
    proto.getSubscription = async () => (w.__push.subscribed ? sub : null)
  })
  const server = new FakeSupabase()
  await server.attach(page.context())
  await open(page)

  await goSettings(page, 'nuvem')
  const section = page.getByTestId('push-section')
  await expect(section.getByTestId('push-needs-cloud')).toBeVisible()

  await page.getByTestId('cloud-email').fill('lucas@exemplo.com')
  await page.getByTestId('cloud-password').fill('cafe com pao na varanda')
  await page.getByTestId('cloud-submit').click()
  await expect(page.getByTestId('cloud-section')).toContainText('Conectado como lucas@exemplo.com', { timeout: 15_000 })

  await section.getByTestId('push-enable').click()
  await expect(section).toContainText('Ativo neste aparelho', { timeout: 15_000 })
  // a chave usada é a que o servidor anunciou
  expect(await page.evaluate(() => (window as unknown as { __push: { key: string } }).__push.key)).toBe(server.vapidPublicKey)
  const saved = server.pushSubs.get('https://push.exemplo.test/aparelho-do-lucas')
  expect(saved).toMatchObject({ partner_id: 'A', tz: 'America/Sao_Paulo', show_details: false, p256dh: 'BPchave-publica-do-aparelho' })
  await section.scrollIntoViewIfNeeded()
  await noHorizontalOverflow(page)
  await shot(page, '90-lembretes', info.project.name)

  // nome do remédio na tela bloqueada só se ativar
  await section.getByTestId('push-details').click()
  await expect.poll(() => server.pushSubs.get('https://push.exemplo.test/aparelho-do-lucas')?.show_details).toBe(true)

  await section.getByTestId('push-disable').click()
  await expect(section).toContainText('Desligado neste aparelho')
  expect(server.pushSubs.size).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { __push: { unsubscribed: number } }).__push.unsubscribed)).toBe(1)
  expect(server.failures).toEqual([])
})
