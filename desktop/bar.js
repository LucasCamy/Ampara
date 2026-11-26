// Barra: um campo só. Enter guarda como ideia; no modo conversa (botão de balão ou Ctrl+Enter), Enter conversa.
// A resposta aparece embaixo, na mesma peça. O texto nunca é gravado aqui: segue para o Ampara (cofre).
// Tudo o que chega para mostrar é texto: só textContent, nunca HTML.
const input = document.getElementById('text')
const label = document.getElementById('text-label')
const modeBtn = document.getElementById('mode')
const out = document.getElementById('out')
let chatMode = false
let view = { kind: 'clear' }

const el = (tag, cls, text) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = text
  return n
}
const button = (text, onClick, cls = 'btn') => {
  const b = el('button', cls, text)
  b.type = 'button'
  b.addEventListener('click', onClick)
  return b
}

function setChat(on) {
  chatMode = on
  document.body.classList.toggle('chat', on)
  modeBtn.setAttribute('aria-pressed', String(on))
  const text = !on ? 'O que está na sua cabeça?' : view.kind === 'chat' && view.conversationId ? 'Continue a conversa…' : 'Pergunte ou pense em voz alta…'
  input.placeholder = text
  label.textContent = text
  if (!on && view.kind === 'chat') view = { kind: 'clear' }
  render()
}

/** Ajusta a altura da janela ao conteúdo (a barra tem 8 px de margem para a sombra). */
function fit() {
  const open = !out.hidden
  document.body.classList.toggle('open', open)
  // mede na hora (força o layout): quadros de animação podem ficar pausados nesta janela transparente
  window.bar.resize(open ? 63 + out.offsetHeight + 16 : 72)
}

function chatActions(v) {
  const row = el('div', 'row')
  const extract = button(v.extracted ? 'Extraída para as Ideias' : 'Extrair', () => window.bar.action('extract'), 'btn main')
  extract.disabled = !!v.extracted || !!v.busy || !(v.messages || []).length
  extract.title = 'Leva a conversa para as Ideias; a IA organiza por trás'
  row.append(extract, button('Nova conversa', () => window.bar.action('new')), button('Conversas', () => window.bar.action('list')))
  return row
}

function render() {
  out.replaceChildren()
  const v = view
  if (v.kind === 'saved') {
    out.append(el('p', 'status', v.text || 'Guardado.'))
    if (v.undo) {
      const row = el('div', 'row')
      row.append(button('Desfazer', () => window.bar.action('undo', v.undo)))
      out.append(row)
    }
  } else if (v.kind === 'chat') {
    const msgs = v.messages || []
    const lastIa = [...msgs].reverse().find((m) => m.role === 'IA')
    const lastIdx = lastIa ? msgs.lastIndexOf(lastIa) : -1
    // a pergunta que gerou a última resposta fica junto dela; o resto vai para "Ver mais"
    const asked = lastIdx > 0 && msgs[lastIdx - 1].role === 'PESSOA' ? lastIdx - 1 : lastIdx
    const after = msgs.slice(lastIdx + 1).filter((m) => m.role === 'PESSOA')
    if (!v.busy && lastIa && asked < lastIdx) out.append(el('p', 'me', msgs[asked].text))
    for (const m of after) out.append(el('p', 'me', m.text))
    if (v.busy) out.append(el('p', 'status', 'Pensando…'))
    else if (lastIa) {
      const p = el('p', 'answer')
      p.append(el('span', 'who', 'Ampara'), document.createTextNode(lastIa.text))
      out.append(p)
    }
    const earlier = asked > 0 ? msgs.slice(0, asked) : []
    if (earlier.length) {
      const d = el('details')
      d.append(el('summary', null, `Ver mais (${earlier.length})`))
      for (const m of earlier) {
        const p = el('p')
        p.append(el('span', 'who', m.role === 'IA' ? 'Ampara' : 'Você'), document.createTextNode(m.text))
        d.append(p)
      }
      d.addEventListener('toggle', fit)
      out.append(d)
    }
    if (v.note) out.append(el('p', 'note', v.note))
    if (v.error) out.append(el('p', 'error', v.error))
    if (v.undo) {
      const row = el('div', 'row')
      row.append(button('Desfazer a organização', () => window.bar.action('undo', v.undo)))
      out.append(row)
    }
    out.append(chatActions(v))
  } else if (v.kind === 'list') {
    out.append(el('p', 'who', 'Conversas'))
    const list = el('div', 'list')
    for (const it of v.items || []) {
      const b = button('', () => { setChat(true); window.bar.action('open', it.id) }, 'item')
      b.append(el('span', null, it.title), el('span', null, it.when))
      list.append(b)
    }
    if (!(v.items || []).length) list.append(el('p', 'note', 'Nenhuma conversa ainda.'))
    out.append(list)
    const row = el('div', 'row')
    row.append(button('Nova conversa', () => { setChat(true); window.bar.action('new') }))
    out.append(row)
  } else if (v.kind === 'proposal') {
    const p = v.proposal
    if (v.busy || !p) out.append(el('p', 'status', v.text || 'Vendo o que você já sabe sobre isso…'))
    else {
      out.append(el('p', 'who', p.kind === 'EVENT' ? 'Marcar na agenda?' : 'Criar tarefa?'))
      out.append(el('p', 'title', p.title))
      out.append(el('p', 'status', p.when))
      if (p.location) out.append(el('p', 'status', p.location))
      if (p.notes) out.append(el('p', 'note', p.notes))
      if (p.source && (p.location || p.notes)) out.append(el('p', 'note', `Achei nas suas anotações: ${p.source}`))
      for (const c of p.conflicts || []) out.append(el('p', 'error', `Já tem nesse horário: ${c}`))
      const row = el('div', 'row')
      row.append(button(p.kind === 'EVENT' ? 'Marcar' : 'Criar tarefa', () => window.bar.action('confirm'), 'btn main'), button('Só guardar como ideia', () => window.bar.action('keep')))
      out.append(row)
    }
  } else if (v.kind === 'locked') {
    out.append(el('p', 'status', v.text || 'Entre no Ampara para continuar. O que você escreveu ficou esperando aqui.'))
    const row = el('div', 'row')
    row.append(button('Abrir o Ampara', () => window.bar.openFull(), 'btn main'))
    out.append(row)
  } else if (chatMode) {
    out.append(el('p', 'note', 'Escreva na barra e aperte Enter para conversar.'))
    const row = el('div', 'row')
    row.append(button('Conversas anteriores', () => window.bar.action('list')))
    out.append(row)
  }
  out.hidden = !out.childNodes.length
  fit()
}

const send = (mode) => {
  const text = input.value.trim()
  if (!text) return
  if (mode === 'chat' && !chatMode) setChat(true)
  window.bar.submit(text, mode)
  input.value = ''
}
document.getElementById('bar').addEventListener('submit', (e) => { e.preventDefault(); send(chatMode ? 'chat' : 'capture') })
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send('chat') }
  else if (e.key === 'Escape') { e.preventDefault(); window.bar.hide() }
})
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.target !== input) window.bar.hide() })
modeBtn.addEventListener('click', () => { setChat(!chatMode); input.focus() })
document.getElementById('mic').addEventListener('click', () => { input.focus(); window.bar.dictate() })
document.getElementById('full').addEventListener('click', () => window.bar.openFull())
window.bar.onFocus(() => { input.focus(); input.select(); fit() })
window.bar.onView((v) => {
  view = v && typeof v === 'object' ? v : { kind: 'clear' }
  // conversa aberta (da lista ou depois de responder): o cursor volta ao campo para continuar
  if (view.kind === 'chat') {
    setChat(true)
    if (document.activeElement !== input) input.focus()
  } else render()
})
