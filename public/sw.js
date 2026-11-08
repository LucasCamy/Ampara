/* Ampara service worker: app shell offline (network-first para navegação, cache-first para assets) */
// v5: o activate apaga o cache antigo, que podia ter respostas da API guardadas
const CACHE = 'ampara-v5'
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
  // API da nuvem (mesma origem atrás do gateway) nunca passa pelo cache: são dados do casal em texto claro e
  // uma resposta guardada travaria o pull (mesma URL com o mesmo cursor) e a limpeza de cópias sem autorização
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/') || req.headers.has('authorization')) return
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
// O servidor manda { title, body, tag, url, category, sound, label, key } cifrado; só este aparelho decifra.
// O navegador não deixa escolher o som da notificação (é sempre o do sistema). Cada categoria muda então o que
// dá para mudar: vibração (Android), se fica na tela até responder e o botão. Mesmas regras de src/domain/alerts.ts.
const KINDS = {
  med: { vibrate: [200, 100, 200], sticky: true, action: 'Confirmar agora' },
  help: { vibrate: [400, 150, 400, 150, 400], sticky: true, action: 'Responder' },
  support: { vibrate: [150], sticky: false, action: 'Ver no Hoje' },
  partner: { vibrate: [60, 60, 60], sticky: false, action: null },
  home: { vibrate: [], sticky: false, action: null },
}
const SOUNDS = ['med', 'water', 'help', 'support', 'partner', 'home']

self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {
    data = { body: e.data ? e.data.text() : '' }
  }
  const str = (v) => (typeof v === 'string' ? v : '')
  const category = Object.prototype.hasOwnProperty.call(KINDS, data.category) ? data.category : 'home'
  const sound = SOUNDS.includes(data.sound) ? data.sound : category
  const kind = KINDS[category]
  const title = str(data.title) || 'Ampara'
  const tag = str(data.tag) || undefined
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // app na frente: a notificação sai calada e o próprio app toca o som da categoria e mostra o aviso
      const front = wins.filter((w) => w.visibilityState === 'visible')
      front.forEach((w) => w.postMessage({ type: 'ALERT', key: str(data.key), category, sound, title, body: str(data.body), label: str(data.label) }))
      const quiet = front.length > 0
      const options = {
        body: str(data.body),
        tag,
        // nova notificação do mesmo assunto substitui a anterior, mas toca de novo
        renotify: !!tag && !quiet,
        silent: quiet,
        requireInteraction: kind.sticky,
        icon: '/icon-192.png',
        badge: '/icon.svg',
        timestamp: Date.now(),
        data: { url: str(data.url).startsWith('/') ? data.url : '/', category },
      }
      // vibrate junto com silent é erro na especificação
      if (!quiet && kind.vibrate.length) options.vibrate = sound === 'water' ? [120] : kind.vibrate
      if (kind.action) options.actions = [{ action: 'open', title: kind.action }]
      return self.registration.showNotification(title, options)
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
