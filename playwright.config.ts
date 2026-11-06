import { defineConfig, type Project } from '@playwright/test'

const sizes = [
  { name: 'mobile-360', width: 360, height: 780, mobile: true },
  { name: 'iphone-390', width: 390, height: 844, mobile: true },
  { name: 'desktop-1280', width: 1280, height: 800, mobile: false },
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
]
const schemes = ['light', 'dark'] as const

const projects: Project[] = sizes.flatMap((s) =>
  schemes.map((scheme) => ({
    name: `${s.name}-${scheme}`,
    use: {
      channel: 'msedge',
      viewport: { width: s.width, height: s.height },
      hasTouch: s.mobile,
      isMobile: false,
      colorScheme: scheme,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    },
  })),
)

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/artifacts',
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
    // build com nuvem apontando para o Supabase simulado dos testes (e2e/fake-supabase.ts)
    env: { VITE_SUPABASE_URL: 'http://fake-supabase.test', VITE_SUPABASE_ANON_KEY: 'anon-key-de-teste' },
  },
  projects,
})
