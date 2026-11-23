// Ponte mínima entre o Ampara (página) e o PC. A página só vê estas funções (window.amparaDesktop).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('amparaDesktop', {
  version: '1',
  status: () => ipcRenderer.invoke('ampara:status'),
  runStructured: (req) => ipcRenderer.invoke('ampara:run', req),
  onShortcut: (cb) => {
    const fn = () => cb()
    ipcRenderer.on('ampara:shortcut', fn)
    return () => ipcRenderer.removeListener('ampara:shortcut', fn)
  },
})
