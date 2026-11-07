import { loadEnv } from 'vite'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Política de segurança de conteúdo (ver SECURITY.md).
 * Só no build: o dev server do Vite injeta scripts inline para o hot reload.
 * style-src permite 'unsafe-inline' porque o Motion anima via atributo style.
 */
function csp(supabaseUrl: string | undefined): string {
  const extra = supabaseUrl && supabaseUrl !== 'self' ? supabaseUrl : undefined
  const connect = ["'self'", extra].filter(Boolean).join(' ')
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ')
}

// A URL vem do .env* do modo (loadEnv), não só do process.env: senão um build com a URL no .env
// sairia com connect-src sem o Supabase e toda chamada à nuvem seria bloqueada.
const cspMeta = (supabaseUrl: string | undefined): Plugin => ({
  name: 'ampara-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp(supabaseUrl)}" />`)
  },
})

/**
 * Versão do build: o app instalado compara com /version.json (nunca em cache) para oferecer a atualização.
 * Um id por build (data + sufixo aleatório): não depende do .git, que não entra na imagem Docker.
 */
const APP_VERSION = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${Math.random().toString(36).slice(2, 6)}`
const versionFile = (): Plugin => ({
  name: 'ampara-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION, builtAt: new Date().toISOString() }) })
  },
})

/** Cabeçalhos que meta tags não cobrem (anti-clickjacking etc.). Repetidos em public/_headers para hospedagem. */
const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), versionFile(), cspMeta(loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL?.replace(/\/+$/, ''))],
  define: { __APP_VERSION__: JSON.stringify(mode === 'test' ? 'test' : APP_VERSION) },
  server: { headers: securityHeaders },
  preview: { headers: securityHeaders },
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
  },
}))
