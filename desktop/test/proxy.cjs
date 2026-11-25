// Teste do intermediário da IA local: só o Ampara passa, só as rotas de conversa, nada de carregar modelos.
// Rode: node desktop/test/proxy.cjs
const { spawn } = require('child_process')
const http = require('http')
const assert = require('assert')
const path = require('path')

const UP = 1299
const PX = 1298
const upstream = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify({ path: req.url, method: req.method, body }))
  })
}).listen(UP, '127.0.0.1')

const proxy = spawn(process.execPath, [path.join(__dirname, '..', 'ia-local', 'proxy.cjs')], {
  env: { ...process.env, AMPARA_AI_PORT: String(PX), LMSTUDIO_URL: `http://127.0.0.1:${UP}`, AMPARA_ORIGINS: 'https://ampara.cloudlane.com.br,app://ampara' },
  stdio: ['ignore', 'pipe', 'inherit'],
})

const call = (method, p, headers = {}, body) => fetch(`http://127.0.0.1:${PX}${p}`, { method, headers, body })

;(async () => {
  await new Promise((r) => proxy.stdout.once('data', r))
  try {
    const ok = await call('OPTIONS', '/v1/chat/completions', { Origin: 'https://ampara.cloudlane.com.br', 'Access-Control-Request-Method': 'POST' })
    assert.strictEqual(ok.status, 204)
    assert.strictEqual(ok.headers.get('access-control-allow-origin'), 'https://ampara.cloudlane.com.br')

    const evil = await call('POST', '/v1/chat/completions', { Origin: 'https://site-qualquer.com', 'Content-Type': 'application/json' }, '{}')
    assert.strictEqual(evil.status, 403, 'outro site é recusado')
    assert.strictEqual((await call('OPTIONS', '/v1/models', { Origin: 'https://site-qualquer.com' })).status, 403)

    const chat = await call('POST', '/v1/chat/completions', { Origin: 'app://ampara', 'Content-Type': 'application/json' }, '{"a":1}')
    assert.strictEqual(chat.status, 200)
    assert.strictEqual(chat.headers.get('access-control-allow-origin'), 'app://ampara', 'cabeçalho * do LM Studio não vaza')
    assert.deepStrictEqual(await chat.json(), { path: '/v1/chat/completions', method: 'POST', body: '{"a":1}' })
    const sense = await call('POST', '/v1/embeddings', { Origin: 'app://ampara', 'Content-Type': 'application/json' }, '{"b":2}')
    assert.deepStrictEqual(await sense.json(), { path: '/v1/embeddings', method: 'POST', body: '{"b":2}' })

    assert.strictEqual((await call('GET', '/v1/models')).status, 200, 'sem Origin (curl local) funciona')
    for (const [m, p] of [['POST', '/api/v1/models/load'], ['POST', '/v1/models/download'], ['GET', '/']]) {
      assert.strictEqual((await call(m, p, { Origin: 'app://ampara' })).status, 404, `${m} ${p} bloqueado`)
    }
    const big = await call('POST', '/v1/chat/completions', { Origin: 'app://ampara', 'Content-Type': 'application/json' }, 'x'.repeat(600 * 1024)).catch(() => ({ status: 413 }))
    assert.strictEqual(big.status, 413, 'pedido grande demais')
    console.log('INTERMEDIÁRIO OK')
  } catch (e) {
    console.error('INTERMEDIÁRIO FALHOU:', e.message)
    process.exitCode = 1
  } finally {
    proxy.kill()
    upstream.close()
  }
})()
