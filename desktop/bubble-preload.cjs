// Ponte da bolinha: só mover, soltar, abrir/fechar o campo e o menu. Nada de dados do Ampara aqui.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('bubble', {
  moveBy: (dx, dy) => ipcRenderer.send('bubble:moveBy', Number(dx) || 0, Number(dy) || 0),
  dragEnd: () => ipcRenderer.send('bubble:dragEnd'),
  toggle: () => ipcRenderer.send('bubble:toggle'),
  menu: () => ipcRenderer.send('bubble:menu'),
})
