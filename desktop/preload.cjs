// Ponte mínima entre o Ampara (página) e o PC. A página só vê estas funções (window.amparaDesktop).
const { contextBridge, ipcRenderer } = require('electron')

const listen = (channel, cb) => {
  const fn = (_e, ...args) => cb(...args)
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

contextBridge.exposeInMainWorld('amparaDesktop', {
  version: '2',
  status: () => ipcRenderer.invoke('ampara:status'),
  runStructured: (req) => ipcRenderer.invoke('ampara:run', req),
  onCompact: (cb) => listen('ampara:compact', (compact) => cb(!!compact)),
  openFull: () => ipcRenderer.send('ampara:open-full'),
  isCompact: () => ipcRenderer.invoke('ampara:is-compact'),
  dictate: () => ipcRenderer.invoke('ampara:dictate'),
  onShortcut: (cb) => listen('ampara:shortcut', () => cb()),
  // painel da barra: o que a pessoa mandou pela barra espera aqui até a tela estar pronta (cofre aberto)
  onBarSubmit: (cb) => listen('ampara:bar-submit', () => cb()),
  takeBarSubmit: () => ipcRenderer.invoke('ampara:take-bar-submit'),
  onPanelTab: (cb) => listen('ampara:panel-tab', (tab) => cb(tab)),
  hidePanel: () => ipcRenderer.send('ampara:hide-all'),
})
