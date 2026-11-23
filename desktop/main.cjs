// Ampara no PC (ADR-0008): o próprio app web, empacotado e servido por app://ampara, mais o que o
// navegador não faz: IA pela assinatura (Claude Code), bolinha flutuante e atalho global para soltar um pensamento.
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
let bubble = null
let tray = null
let quitting = false
/** Modo compacto: a janela vira um painel pequeno, por cima de tudo, perto da bolinha, só para soltar. */
let compact = false
let normalBounds = null

const BUBBLE = 76
const COMPACT = { width: 440, height: 540 }
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
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  win.loadURL(`${ORIGIN}/#/ideias`)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) e.preventDefault() })
  // fechar a janela só esconde: a bolinha continua por perto (Sair fica no menu da bolinha e da bandeja)
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win.hide()
  })
  win.on('closed', () => { win = null })
}

/* ---------------------------------------------------------------- bolinha e modo compacto */

function bubblePosition() {
  const wa = screen.getPrimaryDisplay().workArea
  const saved = readPrefs().bubble
  let x = saved?.x ?? wa.x + wa.width - BUBBLE - 24
  let y = saved?.y ?? wa.y + wa.height - BUBBLE - 24
  const d = screen.getDisplayNearestPoint({ x, y }).workArea
  x = Math.min(Math.max(x, d.x), d.x + d.width - BUBBLE)
  y = Math.min(Math.max(y, d.y), d.y + d.height - BUBBLE)
  return { x, y }
}

function createBubble() {
  bubble = new BrowserWindow({
    ...bubblePosition(), width: BUBBLE, height: BUBBLE,
    frame: false, transparent: true, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    // não rouba o foco: clicar na bolinha com o painel aberto fecha o painel
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false, focusable: false, title: 'Ampara (bolinha)',
    webPreferences: { preload: path.join(__dirname, 'bubble-preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  bubble.setAlwaysOnTop(true, 'floating')
  bubble.loadFile(path.join(__dirname, 'bubble.html'))
  bubble.once('ready-to-show', () => { if (readPrefs().bubbleHidden !== true) bubble.showInactive() })
  bubble.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  bubble.webContents.on('will-navigate', (e) => e.preventDefault())
  bubble.on('closed', () => { bubble = null })
}

/** Painel compacto perto da bolinha (ou do canto da tela), sempre por cima, com o campo em foco. */
function showCompact() {
  if (!win) createWindow()
  if (!compact) normalBounds = win.isMaximized() ? null : win.getBounds()
  if (win.isMaximized()) win.unmaximize()
  const anchor = bubble && bubble.isVisible() ? bubble.getBounds() : { ...bubblePosition(), width: BUBBLE, height: BUBBLE }
  const d = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y }).workArea
  const width = Math.min(COMPACT.width, d.width - 16)
  const height = Math.min(COMPACT.height, d.height - 16)
  let x = anchor.x + anchor.width - width
  let y = anchor.y - height - 8
  if (y < d.y + 8) y = anchor.y + anchor.height + 8
  x = Math.min(Math.max(x, d.x + 8), d.x + d.width - width - 8)
  y = Math.min(Math.max(y, d.y + 8), d.y + d.height - height - 8)
  win.setBounds({ x: Math.round(x), y: Math.round(y), width, height })
  win.setAlwaysOnTop(true, 'floating')
  compact = true
  win.webContents.send('ampara:compact', true)
  win.show()
  win.focus()
  win.webContents.send('ampara:shortcut')
}

/** Bolinha e atalho: abre o painel; se ele já está aberto e em foco, esconde. */
function toggleCompact(fromBubbleClick = false) {
  if (win && compact && win.isVisible() && (fromBubbleClick || win.isFocused())) win.hide()
  else showCompact()
}

/** Janela normal (abrir o Ampara de novo, bandeja): volta ao tamanho de antes, sem ficar por cima. */
function showNormal() {
  if (!win) createWindow()
  if (compact) {
    win.setAlwaysOnTop(false)
    win.setBounds(normalBounds || { width: 1280, height: 860 })
    compact = false
    win.webContents.send('ampara:compact', false)
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function toggleBubble() {
  if (!bubble) createBubble()
  const hide = bubble.isVisible()
  if (hide) bubble.hide()
  else bubble.showInactive()
  writePrefs({ bubbleHidden: hide })
  refreshMenus()
}

function quit() {
  quitting = true
  app.quit()
}

function menuTemplate() {
  return [
    { label: 'Soltar um pensamento', click: showCompact },
    { label: 'Abrir o Ampara', click: showNormal },
    { label: bubble && bubble.isVisible() ? 'Esconder a bolinha' : 'Mostrar a bolinha', click: toggleBubble },
    { type: 'separator' },
    { label: 'Sair do Ampara', click: quit },
  ]
}

function refreshMenus() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()))
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'icon.png'))
  tray = new Tray(img.isEmpty() ? img : img.resize({ width: 16, height: 16 }))
  tray.setToolTip('Ampara · Ctrl+Shift+Espaço solta um pensamento')
  tray.on('click', showCompact)
  refreshMenus()
}

ipcMain.on('ampara:open-full', (event) => { if (fromApp(event)) showNormal() })
ipcMain.handle('ampara:is-compact', (event) => fromApp(event) && compact)

// Digitação por voz do Windows (o mesmo que Win + H): escreve no campo que estiver com o cursor.
const WIN_H = "Add-Type -Namespace AM -Name K -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte b, byte s, uint f, System.UIntPtr e);'; [AM.K]::keybd_event(0x5B,0,0,[UIntPtr]::Zero); [AM.K]::keybd_event(0x48,0,0,[UIntPtr]::Zero); [AM.K]::keybd_event(0x48,0,2,[UIntPtr]::Zero); [AM.K]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)"
ipcMain.handle('ampara:dictate', (event) => {
  if (!fromApp(event) || process.platform !== 'win32') return false
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_H], { windowsHide: true, timeout: 15000 }, (err) => resolve(!err))
  })
})

const fromBubble = (event) => !!bubble && event.sender === bubble.webContents

ipcMain.on('bubble:moveBy', (event, dx, dy) => {
  if (!fromBubble(event)) return
  const b = bubble.getBounds()
  bubble.setBounds({ x: Math.round(b.x + dx), y: Math.round(b.y + dy), width: BUBBLE, height: BUBBLE })
})
ipcMain.on('bubble:dragEnd', (event) => {
  if (!fromBubble(event)) return
  const { x, y } = bubble.getBounds()
  writePrefs({ bubble: { x, y } })
})
ipcMain.on('bubble:toggle', (event) => { if (fromBubble(event)) toggleCompact(true) })
ipcMain.on('bubble:menu', (event) => {
  if (fromBubble(event)) Menu.buildFromTemplate(menuTemplate()).popup({ window: bubble })
})

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
  createBubble()
  createTray()
  if (!globalShortcut.register(SHORTCUT, () => toggleCompact())) console.warn('Atalho ocupado:', SHORTCUT)
})

app.on('before-quit', () => { quitting = true })

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => app.quit())
