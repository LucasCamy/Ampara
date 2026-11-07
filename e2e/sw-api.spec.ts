import { expect, open, test } from './fixtures'

/**
 * Em produção a nuvem fica na mesma origem do app (gateway nginx em /rest/v1 e /auth/v1). O service worker não
 * pode guardar essas respostas: são dados do casal em texto claro e uma resposta guardada travaria o pull
 * (mesma URL com o mesmo cursor). Aqui a API da mesma origem é simulada por rota e chamada duas vezes.
 */
test('service worker deixa a API da mesma origem passar direto, sem guardar nada', async ({ page, errors }, info) => {
  void errors
  test.skip(!['iphone-390-light', 'desktop-1280-dark'].includes(info.project.name), 'service worker validado em 2 projetos')

  let hits = 0
  await page.route(/\/(rest|auth)\/v1\//, (r) => {
    hits += 1
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ n: hits, url: r.request().url() }) })
  })
  await open(page)
  // espera o service worker assumir a página (clients.claim no activate)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((res) => navigator.serviceWorker.addEventListener('controllerchange', () => res(null), { once: true }))
    }
  })

  const calls = await page.evaluate(async () => {
    const get = (path: string, auth: boolean) =>
      fetch(path, { headers: auth ? { Authorization: 'Bearer t', apikey: 'k' } : {} }).then((r) => r.json() as Promise<{ n: number }>)
    const out: number[] = []
    for (let i = 0; i < 2; i++) {
      out.push((await get('/rest/v1/tasks?select=*&synced_at=gt.2026-01-01', true)).n)
      out.push((await get('/auth/v1/user', true)).n)
      out.push((await get('/rest/v1/profiles?select=id', false)).n)
    }
    return out
  })
  // cada chamada chegou à "rede" (nenhuma resposta repetida do cache)
  expect(calls).toEqual([1, 2, 3, 4, 5, 6])

  const cached = await page.evaluate(async () => {
    const urls: string[] = []
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname)
    }
    return urls
  })
  expect(cached.filter((p) => p.startsWith('/rest/') || p.startsWith('/auth/'))).toEqual([])
  // o app continua guardado para abrir offline
  expect(cached).toContain('/')
})
