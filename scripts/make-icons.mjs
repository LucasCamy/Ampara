// Gera os PNGs do PWA (apple-touch-icon 180, 192, 512) a partir de public/icon.svg usando o Edge instalado.
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pub = join(import.meta.dirname, '..', 'public')
const svg = readFileSync(join(pub, 'icon.svg'), 'utf8')
const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage()
for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  await page.setViewportSize({ width: size, height: size })
  // apple-touch-icon sem cantos arredondados (o iOS aplica a máscara)
  const body = file.startsWith('apple') ? svg.replace('rx="112"', 'rx="0"') : svg
  await page.setContent(`<html><body style="margin:0">${body.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  await page.screenshot({ path: join(pub, file), omitBackground: true })
}
await browser.close()
console.log('ícones gerados')
