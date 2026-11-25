// Barra: Enter guarda como ideia, Ctrl+Enter abre uma conversa, Esc esconde. O texto nunca é gravado aqui:
// segue para a janela do Ampara (cofre), que guarda e organiza.
const input = document.getElementById('text')
const send = (mode) => {
  const text = input.value.trim()
  if (!text) return
  window.bar.submit(text, mode)
  input.value = ''
}
document.getElementById('bar').addEventListener('submit', (e) => { e.preventDefault(); send('capture') })
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send('chat') }
  else if (e.key === 'Escape') { e.preventDefault(); window.bar.hide() }
})
document.getElementById('mic').addEventListener('click', () => { input.focus(); window.bar.dictate() })
document.getElementById('talks').addEventListener('click', () => window.bar.openPanel('talks'))
document.getElementById('full').addEventListener('click', () => window.bar.openFull())
window.bar.onFocus(() => { input.focus(); input.select() })
