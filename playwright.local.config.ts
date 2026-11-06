import { defineConfig } from '@playwright/test'

/**
 * E2E contra o Supabase REAL do docker-compose.yml (Postgres + GoTrue + PostgREST).
 * Antes: `npm run db:up`. Depois: `npm run e2e:local`.
 * Usa um build de produção (com CSP) no modo "docker" (.env.docker) em outra porta.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'real-supabase.spec.ts',
  outputDir: './test-results/artifacts-local',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174',
    channel: 'msedge',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite build --mode docker --outDir dist-local && npx vite preview --outDir dist-local --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: 'iphone-390-light', use: { viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: 'light' } },
    { name: 'desktop-1280-dark', use: { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' } },
  ],
})
