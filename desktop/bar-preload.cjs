// Ponte da barra: enviar o texto, apertar botões, ajustar a altura e receber o que mostrar (só texto).
// Nenhum dado do cofre é gravado aqui.
const { contextBridge, ipcRenderer } = require('electron')

const ACTIONS = new Set(['new', 'list', 'open', 'extract', 'undo', 'confirm', 'keep'])

contextBridge.exposeInMainWorld('bar', {
  submit: (text, mode) => ipcRenderer.send('bar:submit', String(text || '').slice(0, 8000), mode === 'chat' ? 'chat' : 'capture'),
  action: (type, id) => { if (ACTIONS.has(type)) ipcRenderer.send('bar:action', { type, id: typeof id === 'string' ? id.slice(0, 64) : undefined }) },
  resize: (height) => ipcRenderer.send('bar:resize', Number(height) || 0),
  hide: () => ipcRenderer.send('bar:hide'),
  dictate: () => ipcRenderer.send('bar:dictate'),
  openFull: () => ipcRenderer.send('bar:full'),
  onFocus: (cb) => ipcRenderer.on('bar:focus', () => cb()),
  onView: (cb) => ipcRenderer.on('bar:view', (_e, view) => cb(view)),
})
