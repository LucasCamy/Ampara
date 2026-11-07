/* Ampara service worker: app shell offline (network-first para navegação, cache-first para assets) */
const CACHE = 'ampara-v4'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg', '/theme-init.js'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return
  // versão e o próprio service worker sempre da rede: é assim que o app instalado descobre a versão nova
  if (url.pathname === '/version.json' || url.pathname === '/sw.js') return
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})

// O app pede para trocar já pela versão nova (botão Atualizar)
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting()
})

/* ---------- lembretes (Web Push) ---------- */
// O servidor manda { title, body, tag, url } cifrado; só este aparelho decifra.
self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {
    data = { body: e.data ? e.data.text() : '' }
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Ampara'
  e.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      // nova dose do mesmo horário substitui a anterior, mas toca de novo
      renotify: typeof data.tag === 'string',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/' },
    }),
  )
})

// Toque na notificação: foca o app aberto ou abre um novo (só caminhos do próprio app)
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || '/', self.location.origin)
  if (url.origin !== self.location.origin) return
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === url.origin)
      if (open) {
        // o app já está aberto: avisa o destino por mensagem (WindowClient.navigate não existe no iOS)
        open.postMessage({ type: 'OPEN_URL', url: url.pathname + url.search + url.hash })
        return open.focus()
      }
      return self.clients.openWindow(url.href)
    }),
  )
})
