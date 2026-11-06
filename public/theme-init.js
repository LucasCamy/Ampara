// Aplica o tema antes da primeira pintura (arquivo externo para permitir CSP sem 'unsafe-inline' em scripts)
try {
  var p = JSON.parse(localStorage.getItem('ampara:prefs') || '{}')
  document.documentElement.dataset.theme = p.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
} catch {
  document.documentElement.dataset.theme = 'light'
}
