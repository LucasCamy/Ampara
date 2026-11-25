// Intermediário da IA local (ADR-0010). Fica entre o Tailscale e o LM Studio:
// - só repassa /v1/models, /v1/chat/completions e /v1/embeddings (sentido, ADR-0012) (nada de carregar/baixar modelos de fora);
// - libera CORS apenas para as origens do Ampara (o site publicado e o app do PC), nunca para "qualquer site";
// - escuta só em 127.0.0.1: de fora, só se chega pelo `tailscale serve` (rede privada da pessoa).
// Uso: node proxy.cjs  (variáveis: AMPARA_AI_PORT, LMSTUDIO_URL, AMPARA_ORIGINS separadas por vírgula)
const http = require('http')

const PORT = Number(process.env.AMPARA_AI_PORT || 1235)
const UPSTREAM = new URL(process.env.LMSTUDIO_URL || 'http://127.0.0.1:1234')
const ORIGINS = new Set((process.env.AMPARA_ORIGINS || 'https://ampara.cloudlane.com.br,app://ampara').split(',').map((s) => s.trim()).filter(Boolean))
const ALLOWED = new Set(['GET /v1/models', 'POST /v1/chat/completions', 'POST /v1/embeddings'])
const MAX_BODY = 512 * 1024

function cors(req, res) {
  const origin = req.headers.origin
  if (origin && ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type')
    res.setHeader('Access-Control-Max-Age', '600')
  }
  return !origin || ORIGINS.has(origin)
}

const server = http.createServer((req, res) => {
  const path = (req.url || '').split('?')[0]
  const allowedOrigin = cors(req, res)
  if (req.method === 'OPTIONS') {
    res.writeHead(allowedOrigin ? 204 : 403).end()
    return
  }
  if (!allowedOrigin) {
    res.writeHead(403, { 'Content-Type': 'application/json' }).end('{"error":"origem não autorizada"}')
    return
  }
  if (!ALLOWED.has(`${req.method} ${path}`)) {
    res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"não disponível"}')
    return
  }
  let size = 0
  const chunks = []
  req.on('data', (c) => {
    size += c.length
    if (size > MAX_BODY) { res.writeHead(413).end(); req.destroy(); return }
    chunks.push(c)
  })
  req.on('end', () => {
    if (res.writableEnded) return
    const body = Buffer.concat(chunks)
    const up = http.request({
      hostname: UPSTREAM.hostname, port: UPSTREAM.port, path, method: req.method,
      headers: { 'content-type': req.headers['content-type'] || 'application/json', 'content-length': body.length },
    }, (r) => {
      res.writeHead(r.statusCode || 502, { 'Content-Type': r.headers['content-type'] || 'application/json' })
      r.pipe(res)
    })
    up.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }).end('{"error":"LM Studio não respondeu"}') })
    up.setTimeout(170000, () => up.destroy())
    up.end(body)
  })
})

server.listen(PORT, '127.0.0.1', () => console.log(`IA local do Ampara em http://127.0.0.1:${PORT} -> ${UPSTREAM.origin} · origens: ${[...ORIGINS].join(', ')}`))
