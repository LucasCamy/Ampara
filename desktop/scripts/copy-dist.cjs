// Copia o build web (../dist) para desktop/app-dist, que vai dentro do instalador.
const fs = require('fs')
const path = require('path')

const from = path.join(__dirname, '..', '..', 'dist')
const to = path.join(__dirname, '..', 'app-dist')
if (!fs.existsSync(path.join(from, 'index.html'))) {
  console.error('Rode "npm run build" na raiz do Ampara antes.')
  process.exit(1)
}
fs.rmSync(to, { recursive: true, force: true })
fs.cpSync(from, to, { recursive: true })
fs.copyFileSync(path.join(__dirname, '..', '..', 'public', 'icon-512.png'), path.join(__dirname, '..', 'icon.png'))

// endereço da nuvem (o mesmo do build): o exe libera só este endereço para a página
const envFile = path.join(__dirname, '..', '..', '.env.desktop')
const url = fs.existsSync(envFile) ? (/^VITE_SUPABASE_URL=(.+)$/m.exec(fs.readFileSync(envFile, 'utf8'))?.[1] ?? '').trim() : ''
fs.writeFileSync(path.join(to, 'desktop.json'), JSON.stringify({ cloud: url }))
console.log(url ? `nuvem: ${url}` : 'sem nuvem: os dados ficam só neste PC (crie .env.desktop para sincronizar)')
console.log('app copiado para', to)
