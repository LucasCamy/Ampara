// Guarda das regras visuais (AGENTS.md): cor só por token, sem paleta padrão do Tailwind,
// sem travessão longo e sem emoji como ícone em código de interface.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..', 'src')
const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.ts$/.test(name)) files.push(p)
  }
}
walk(root)

const PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|shadow|accent|decoration|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/
const HEX = /#[0-9a-fA-F]{3,8}\b/
const EMDASH = /—/
const EMOJI = /\p{Extended_Pictographic}/u

const problems = []
for (const file of files) {
  const rel = relative(join(root, '..'), file).replaceAll('\\', '/')
  const isTokens = rel === 'src/styles/tokens.css'
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const where = `${rel}:${i + 1}`
      if (!isTokens && HEX.test(line)) problems.push(`${where} hex solto: ${line.trim()}`)
      if (PALETTE.test(line)) problems.push(`${where} cor padrão do Tailwind: ${line.match(PALETTE)[0]}`)
      if (EMDASH.test(line)) problems.push(`${where} travessão longo`)
      if (EMOJI.test(line)) problems.push(`${where} emoji em código de interface`)
    })
}

if (problems.length) {
  console.error(`check-tokens: ${problems.length} problema(s)\n` + problems.join('\n'))
  process.exit(1)
}
console.log(`check-tokens: ok (${files.length} arquivos)`)
