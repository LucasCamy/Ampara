// Ponte mínima entre o Ampara (página) e o PC. A página só vê estas funções (window.amparaDesktop).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('amparaDesktop', {
  version: '1',
  status: () => ipcRenderer.invoke('ampara:status'),
  runStructured: (req) => ipcRenderer.invoke('ampara:run', req),
  onCompact: (cb) => {
    const fn = (_e, compact) => cb(!!compact)
    ipcRenderer.on('ampara:compact', fn)
    return () => ipcRenderer.removeListener('ampara:compact', fn)
  },
  openFull: () => ipcRenderer.send('ampara:open-full'),
  isCompact: () => ipcRenderer.invoke('ampara:is-compact'),
  dictate: () => ipcRenderer.invoke('ampara:dictate'),
  onShortcut: (cb) => {
    const fn = () => cb()
    ipcRenderer.on('ampara:shortcut', fn)
    return () => ipcRenderer.removeListener('ampara:shortcut', fn)
  },
})
