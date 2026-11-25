// Ponte da barra: só enviar o texto, esconder, ditar e abrir o painel. Nenhum dado do Ampara passa por aqui.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('bar', {
  submit: (text, mode) => ipcRenderer.send('bar:submit', String(text || '').slice(0, 8000), mode === 'chat' ? 'chat' : 'capture'),
  hide: () => ipcRenderer.send('bar:hide'),
  dictate: () => ipcRenderer.send('bar:dictate'),
  openPanel: (tab) => ipcRenderer.send('bar:panel', tab === 'talks' ? 'talks' : 'capture'),
  openFull: () => ipcRenderer.send('bar:full'),
  onFocus: (cb) => ipcRenderer.on('bar:focus', () => cb()),
})
