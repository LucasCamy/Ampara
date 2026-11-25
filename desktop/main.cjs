// Ampara no PC (ADR-0008): o próprio app web, empacotado e servido por app://ampara, mais o que o
// navegador não faz: IA pela assinatura (Claude Code), barra de escrita escondida e atalho global para soltar um pensamento.
const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, net, protocol, screen, session, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { findClaude, runStructured } = require('./claude.cjs')
const { execFile } = require('child_process')

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
let bar = null
let tray = null
let quitting = false
/** O que a pessoa mandou pela barra espera aqui até o Ampara (cofre aberto) pegar. */
let pendingBar = null
/** O app avisa quando está pronto para atender a barra por trás (cofre aberto). */
let appReady = false
/** A digitação por voz do Windows rouba o foco: não esconder enquanto ela roda. */
let dictatingUntil = 0
// Testes: a barra começa visível e não some ao perder o foco.
const TEST_VISIBLE = process.env.AMPARA_BAR_VISIBLE === '1'

// A barra tem 8 px de margem em volta para a sombra: 480 de largura visível. A resposta cresce para baixo.
const BAR = { width: 496, height: 72, maxHeight: 600 }
const prefsFile = () => path.join(app.getPath('userData'), 'desktop-prefs.json')
function readPrefs() {
  try { return JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) } catch { return {} }
}
function writePrefs(patch) {
  try { fs.writeFileSync(prefsFile(), JSON.stringify({ ...readPrefs(), ...patch })) } catch { /* sem preferências: segue */ }
}

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
app.on('second-instance', () => showNormal())

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
    // escondido, o app continua atendendo a barra e organizando por trás
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  })
  win.loadURL(`${ORIGIN}/#/ideias`)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) e.preventDefault() })
  // fechar a janela só esconde: o atalho e a bandeja continuam (Sair fica no menu da bandeja)
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win.hide()
  })
  win.on('closed', () => { win = null })
}

/* ---------------------------------------------------------------- barra (a resposta cresce embaixo dela) */

function barPosition() {
  const wa = screen.getPrimaryDisplay().workArea
  const saved = readPrefs().bar
  // primeira vez: no meio, um pouco abaixo do topo (como o PowerToys Run)
  let x = saved?.x ?? wa.x + Math.round((wa.width - BAR.width) / 2)
  let y = saved?.y ?? wa.y + Math.round(wa.height * 0.18)
  const d = screen.getDisplayNearestPoint({ x, y }).workArea
  x = Math.min(Math.max(x, d.x), d.x + d.width - BAR.width)
  y = Math.min(Math.max(y, d.y), d.y + d.height - BAR.height)
  return { x, y }
}

function createBar() {
  bar = new BrowserWindow({
    ...barPosition(), width: BAR.width, height: BAR.height,
    frame: false, transparent: true, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false, title: 'Ampara (barra)',
    webPreferences: { preload: path.join(__dirname, 'bar-preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  })
  bar.setAlwaysOnTop(true, 'floating')
  bar.loadFile(path.join(__dirname, 'bar.html'))
  if (TEST_VISIBLE) bar.once('ready-to-show', () => bar.showInactive())
  bar.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  bar.webContents.on('will-navigate', (e) => e.preventDefault())
  // arrastar pela alça: guarda o lugar novo
  let moveTimer = null
  bar.on('move', () => {
    clearTimeout(moveTimer)
    moveTimer = setTimeout(() => {
      if (!bar || bar.isDestroyed()) return
      const { x, y } = bar.getBounds()
      writePrefs({ bar: { x, y } })
    }, 250)
  })
  bar.on('blur', hideIfAway)
  bar.on('focus', () => { dictatingUntil = 0 })
  bar.on('closed', () => { bar = null })
}

/** Some ao clicar fora (menos enquanto a voz do Windows dita). */
function hideIfAway() {
  if (TEST_VISIBLE) return
  setTimeout(() => {
    if (Date.now() < dictatingUntil) return
    if (!(bar && !bar.isDestroyed() && bar.isFocused())) hideAll()
  }, 200)
}

function hideAll() {
  if (bar && !bar.isDestroyed()) bar.hide()
}

function showBar() {
  if (!bar) createBar()
  if (!bar.isVisible()) {
    const { height } = bar.getBounds()
    bar.setBounds({ ...barPosition(), width: BAR.width, height })
  }
  bar.show()
  bar.focus()
  bar.webContents.send('bar:focus')
}

/** A barra pede a altura do que mostra; nunca passa do fim da tela. */
function resizeBar(height) {
  if (!bar || bar.isDestroyed()) return
  const b = bar.getBounds()
  const d = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea
  const h = Math.round(Math.min(Math.max(height, BAR.height), BAR.maxHeight, d.y + d.height - b.y))
  if (h !== b.height) bar.setBounds({ x: b.x, y: b.y, width: BAR.width, height: h })
}

/** Atalho: mostra a barra com o cursor pronto; se ela já está em foco, esconde. */
function toggleBar() {
  if (bar && bar.isVisible() && bar.isFocused()) hideAll()
  else showBar()
}

/** Janela normal (abrir o Ampara de novo, bandeja): volta ao tamanho de antes, sem ficar por cima. */
function showNormal() {
  if (!win) createWindow()
  if (bar && !bar.isDestroyed()) bar.hide()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function quit() {
  quitting = true
  app.quit()
}

function menuTemplate() {
  return [
    { label: 'Soltar um pensamento', click: showBar },
    { label: 'Abrir o Ampara', click: showNormal },
    { type: 'separator' },
    { label: 'Sair do Ampara', click: quit },
  ]
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'icon.png'))
  tray = new Tray(img.isEmpty() ? img : img.resize({ width: 16, height: 16 }))
  tray.setToolTip('Ampara · Ctrl+Shift+Espaço abre a barra')
  tray.on('click', showBar)
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()))
}

/** Só a página do próprio app (app://ampara) pode pedir a IA. */
const fromApp = (event) => (event.senderFrame?.url || '').startsWith(ORIGIN)
const fromBar = (event) => !!bar && !bar.isDestroyed() && event.sender === bar.webContents

ipcMain.on('ampara:open-full', (event) => { if (fromApp(event)) showNormal() })
ipcMain.handle('ampara:take-bar-submit', (event) => {
  if (!fromApp(event)) return null
  const p = pendingBar
  pendingBar = null
  return p
})

// Digitação por voz do Windows (o mesmo que Win + H): escreve no campo que estiver com o cursor.
const WIN_H = "Add-Type -Namespace AM -Name K -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte b, byte s, uint f, System.UIntPtr e);'; [AM.K]::keybd_event(0x5B,0,0,[UIntPtr]::Zero); [AM.K]::keybd_event(0x48,0,0,[UIntPtr]::Zero); [AM.K]::keybd_event(0x48,0,2,[UIntPtr]::Zero); [AM.K]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)"
function dictate() {
  if (process.platform !== 'win32') return Promise.resolve(false)
  dictatingUntil = Date.now() + 120000
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_H], { windowsHide: true, timeout: 15000 }, (err) => resolve(!err))
  })
}
ipcMain.handle('ampara:dictate', (event) => (fromApp(event) ? dictate() : false))
ipcMain.on('bar:dictate', (event) => { if (fromBar(event)) void dictate() })

ipcMain.on('bar:hide', (event) => { if (fromBar(event)) hideAll() })
ipcMain.on('bar:full', (event) => { if (fromBar(event)) showNormal() })
ipcMain.on('bar:resize', (event, height) => { if (fromBar(event) && Number.isFinite(height)) resizeBar(height) })

const sendBar = (view) => { if (bar && !bar.isDestroyed()) bar.webContents.send('bar:view', view) }
const LOCKED = { kind: 'locked', text: 'Entre no Ampara para continuar. O que você escreveu ficou esperando aqui.' }

// Enter guarda como ideia; no modo conversa, conversa. O Ampara grava no cofre e responde por trás, escondido.
ipcMain.on('bar:submit', (event, text, mode) => {
  if (!fromBar(event) || typeof text !== 'string' || !text.trim()) return
  pendingBar = { text: text.slice(0, 8000), mode: mode === 'chat' ? 'chat' : 'capture' }
  if (appReady && win) win.webContents.send('ampara:bar-submit')
  else sendBar(LOCKED)
})
const BAR_ACTIONS = new Set(['new', 'list', 'open', 'extract', 'undo'])
ipcMain.on('bar:action', (event, a) => {
  if (!fromBar(event) || !a || !BAR_ACTIONS.has(a.type)) return
  if (!appReady || !win) return sendBar(LOCKED)
  win.webContents.send('ampara:bar-action', { type: a.type, id: typeof a.id === 'string' ? a.id.slice(0, 64) : undefined })
})
ipcMain.on('ampara:bar-ready', (event, ready) => {
  if (!fromApp(event)) return
  appReady = !!ready
  if (appReady && pendingBar && win) win.webContents.send('ampara:bar-submit')
})

/** O que a barra mostra: só campos conhecidos, só texto, com limites. */
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined)
function cleanView(v) {
  if (!v || typeof v !== 'object') return { kind: 'clear' }
  const kinds = ['clear', 'saved', 'chat', 'list', 'locked']
  return {
    kind: kinds.includes(v.kind) ? v.kind : 'clear',
    text: str(v.text, 600),
    conversationId: str(v.conversationId, 64),
    messages: Array.isArray(v.messages)
      ? v.messages.slice(-80).map((m) => ({ role: m && m.role === 'IA' ? 'IA' : 'PESSOA', text: str(m && m.text, 4000) || '' }))
      : undefined,
    busy: !!v.busy,
    extracted: !!v.extracted,
    note: str(v.note, 400),
    error: str(v.error, 400),
    undo: str(v.undo, 64),
    items: Array.isArray(v.items)
      ? v.items.slice(0, 30).map((i) => ({ id: str(i && i.id, 64) || '', title: str(i && i.title, 80) || 'Conversa', when: str(i && i.when, 24) || '' }))
      : undefined,
  }
}
ipcMain.on('ampara:bar-view', (event, view) => { if (fromApp(event)) sendBar(cleanView(view)) })

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
  createBar()
  createTray()
  if (!globalShortcut.register(SHORTCUT, toggleBar)) console.warn('Atalho ocupado:', SHORTCUT)
})

// Testes (desktop/test/bar.cjs): o atalho global do Windows não dá para apertar daqui.
if (process.env.AMPARA_TEST_HOOKS === '1') global.__ampara = { toggleBar, showBar, hideAll, isReady: () => appReady }

app.on('before-quit', () => { quitting = true })

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => app.quit())
