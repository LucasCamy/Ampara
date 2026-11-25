// Ponte mínima entre o Ampara (página) e o PC. A página só vê estas funções (window.amparaDesktop).
const { contextBridge, ipcRenderer } = require('electron')

const listen = (channel, cb) => {
  const fn = (_e, ...args) => cb(...args)
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

contextBridge.exposeInMainWorld('amparaDesktop', {
  version: '3',
  status: () => ipcRenderer.invoke('ampara:status'),
  runStructured: (req) => ipcRenderer.invoke('ampara:run', req),
  openFull: () => ipcRenderer.send('ampara:open-full'),
  dictate: () => ipcRenderer.invoke('ampara:dictate'),
  onShortcut: (cb) => listen('ampara:shortcut', () => cb()),
  // barra (ADR-0013): o app atende por trás, escondido. O texto espera no exe até o cofre estar aberto.
  onBarSubmit: (cb) => listen('ampara:bar-submit', () => cb()),
  takeBarSubmit: () => ipcRenderer.invoke('ampara:take-bar-submit'),
  setBarReady: (ready) => ipcRenderer.send('ampara:bar-ready', !!ready),
  barView: (view) => ipcRenderer.send('ampara:bar-view', view),
  onBarAction: (cb) => listen('ampara:bar-action', (action) => cb(action)),
})
