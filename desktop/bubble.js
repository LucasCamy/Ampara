// Bolinha: arrastar move; clicar abre o campo "O que está na sua cabeça?"; botão direito mostra o menu.
const b = document.getElementById('bubble')
let down = null
let moved = false

b.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  down = { x: e.screenX, y: e.screenY }
  moved = false
  b.setPointerCapture(e.pointerId)
})
b.addEventListener('pointermove', (e) => {
  if (!down) return
  const dx = e.screenX - down.x
  const dy = e.screenY - down.y
  if (!moved && Math.hypot(dx, dy) < 5) return
  moved = true
  window.bubble.moveBy(dx, dy)
  down = { x: e.screenX, y: e.screenY }
})
b.addEventListener('pointerup', () => {
  if (!down) return
  down = null
  if (moved) window.bubble.dragEnd()
  else window.bubble.toggle()
})
b.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    window.bubble.toggle()
  }
})
b.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  window.bubble.menu()
})
