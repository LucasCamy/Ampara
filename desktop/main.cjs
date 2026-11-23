// Ampara no PC (ADR-0008): o próprio app web, empacotado e servido por app://ampara, mais o que o
// navegador não faz: IA pela assinatura (Claude Code) e atalho global para soltar um pensamento.
const { app, BrowserWindow, globalShortcut, ipcMain, net, protocol, session, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { findClaude, runStructured } = require('./claude.cjs')

if (process.env.AMPARA_USER_DATA) app.setPath('userData', process.env.AMPARA_USER_DATA)

const ORIGIN = 'app://ampara'
const SHORTCUT = 'CommandOrControl+Shift+Space'
const MODEL = process.env.AMPARA_AI_MODEL || 'claude-opus-5-5'
const LIMITS = { system: 20000, schema: 20000, input: 80000 }

// Origem própria, "segura" e padrão: IndexedDB, WebCrypto, fetch e service worker funcionam como num site HTTPS.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, serviceWorkers: true } },
])

const distDir = () => process.env.AMPARA_DIST
  || (app.isPackaged ? path.join(process.resourcesPath, 'app-dist') : path.join(__dirname, '..', 'dist'))

let win = null

/** Endereço da nuvem do Ampara gravado no build (desktop.json) ou AMPARA_CLOUD. Sem nuvem: só neste PC. */
function cloudOrigin() {
  const raw = process.env.AMPARA_CLOUD || (() => {
    try { return JSON.parse(fs.readFileSync(path.join(distDir(), 'desktop.json'), 'utf8')).cloud } catch { return '' }
  })()
  try { return raw ? new URL(raw).origin : null } catch { return null }
}

/**
 * O servidor do Ampara só aceita a própria origem (sem CORS, de propósito). Aqui, e só para o endereço da
 * nuvem configurada, o exe responde como se a página fosse daquela origem: libera app://ampara e o preflight.
 * Nenhum outro site ganha acesso, e o servidor continua fechado para navegadores.
 */
function allowCloud() {
  const cloud = cloudOrigin()
  if (!cloud) return
  const filter = { urls: [`${cloud}/*`] }
  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const headers = {}
    for (const [k, v] of Object.entries(details.responseHeaders || {})) if (!/^access-control-/i.test(k)) headers[k] = v
    headers['Access-Control-Allow-Origin'] = [ORIGIN]
    headers['Access-Control-Allow-Headers'] = ['authorization, apikey, content-type, prefer, accept-profile, content-profile, x-client-info']
    headers['Access-Control-Allow-Methods'] = ['GET, POST, PATCH, DELETE, OPTIONS']
    headers['Access-Control-Max-Age'] = ['600']
    callback(details.method === 'OPTIONS' ? { responseHeaders: headers, statusLine: 'HTTP/1.1 204 No Content' } : { responseHeaders: headers })
  })
}

if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => showIdeas())

function serveApp() {
  const root = path.resolve(distDir())
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    if (url.host !== 'ampara') return new Response('Not found', { status: 404 })
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    let file = path.resolve(root, rel)
    // nada fora da pasta do app; rota desconhecida cai no index.html (app de uma página)
    if (!file.startsWith(root + path.sep) && file !== root) return new Response('Forbidden', { status: 403 })
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html')
    return net.fetch(pathToFileURL(file).toString())
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: 'Ampara',
    backgroundColor: '#F7F6F2',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  win.loadURL(`${ORIGIN}/#/ideias`)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) e.preventDefault() })
  win.on('closed', () => { win = null })
}

function showIdeas() {
  if (!win) createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  win.webContents.send('ampara:shortcut')
}

/** Só a página do próprio app (app://ampara) pode pedir a IA. */
const fromApp = (event) => (event.senderFrame?.url || '').startsWith(ORIGIN)

ipcMain.handle('ampara:status', (event) => {
  if (!fromApp(event)) throw new Error('origem não autorizada')
  return { claude: !!findClaude(), model: MODEL }
})

ipcMain.handle('ampara:run', async (event, req) => {
  if (!fromApp(event)) throw new Error('origem não autorizada')
  const ok = req && typeof req.system === 'string' && typeof req.input === 'string' && req.schema && typeof req.schema === 'object'
  if (!ok) throw new Error('Pedido inválido para a IA.')
  if (req.system.length > LIMITS.system || req.input.length > LIMITS.input || JSON.stringify(req.schema).length > LIMITS.schema) {
    throw new Error('Pedido grande demais para a IA.')
  }
  return runStructured({ system: req.system, schema: req.schema, input: req.input, model: MODEL, cwd: path.join(app.getPath('userData'), 'ia') })
})

app.whenReady().then(() => {
  app.setAppUserModelId('br.com.cloudlane.ampara')
  serveApp()
  allowCloud()
  createWindow()
  if (!globalShortcut.register(SHORTCUT, showIdeas)) console.warn('Atalho ocupado:', SHORTCUT)
})

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => app.quit())
