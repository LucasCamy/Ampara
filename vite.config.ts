import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Política de segurança de conteúdo (ver SECURITY.md).
 * Só no build: o dev server do Vite injeta scripts inline para o hot reload.
 * style-src permite 'unsafe-inline' porque o Motion anima via atributo style.
 */
function csp(supabaseUrl: string | undefined): string {
  const connect = ["'self'", supabaseUrl].filter(Boolean).join(' ')
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

const cspMeta = (): Plugin => ({
  name: 'ampara-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp(process.env.VITE_SUPABASE_URL)}" />`)
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

export default defineConfig({
  plugins: [react(), tailwindcss(), cspMeta()],
  server: { headers: securityHeaders },
  preview: { headers: securityHeaders },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
