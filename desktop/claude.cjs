// Chama o Claude Code instalado no PC (login da assinatura da pessoa) para uma resposta estruturada.
// Sem ferramentas, sem plugins, sem MCP, sem histórico: só modelo + esquema. Uso pessoal, no próprio PC.
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

function findClaude() {
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude'
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  const candidates = [...dirs.map((d) => path.join(d, exe)), path.join(os.homedir(), '.local', 'bin', exe)]
  return candidates.find((c) => { try { return fs.statSync(c).isFile() } catch { return false } }) || null
}

function friendly(text) {
  const t = String(text || '')
  if (/log ?in|logged|auth|credential|401|unauthori/i.test(t)) return 'O Claude Code não está conectado. Abra o Claude Code e faça login com sua conta.'
  if (/rate|limit|usage|quota|429/i.test(t)) return 'Você chegou no limite de uso da assinatura agora. Espere um pouco e tente de novo.'
  if (/ENOTFOUND|network|ECONN|fetch failed/i.test(t)) return 'Sem conexão com a internet.'
  return `O Claude Code deu erro: ${t.slice(0, 200)}`
}

/** Roda `claude -p` com esquema JSON. Devolve { json, model }. */
function runStructured({ system, schema, input, model, cwd, timeoutMs = 180000 }) {
  const exe = findClaude()
  if (!exe) return Promise.reject(new Error('Não achei o Claude Code neste PC. Instale e faça login para a IA organizar.'))
  fs.mkdirSync(cwd, { recursive: true })
  const args = ['-p', '--output-format', 'json', '--safe-mode', '--strict-mcp-config', '--tools', '', '--no-session-persistence',
    '--model', model, '--json-schema', JSON.stringify(schema), '--system-prompt', system]
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.ANTHROPIC_API_KEY // usa o login da assinatura, nunca uma chave solta
    delete env.ANTHROPIC_AUTH_TOKEN
    delete env.CLAUDECODE
    const child = spawn(exe, args, { cwd, env, windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('A IA demorou demais. Tente de novo.')) }, timeoutMs)
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(friendly(e.message))) })
    child.on('close', () => {
      clearTimeout(timer)
      let json
      try { json = JSON.parse(out.trim().split('\n').pop()) } catch { return reject(new Error(friendly(err || out || 'resposta vazia'))) }
      if (json.is_error || json.subtype !== 'success') return reject(new Error(friendly(json.result || json.subtype || err)))
      if (json.structured_output === undefined) return reject(new Error('A IA não devolveu a resposta no formato combinado.'))
      const used = Object.keys(json.modelUsage || {})[0] || model
      resolve({ json: json.structured_output, model: used })
    })
    child.stdin.end(input)
  })
}

module.exports = { findClaude, runStructured, friendly }
