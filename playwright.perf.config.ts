// `pnpm perf` (TESTING.md §3, T88): times opening the app, switching tabs and three taps, on a
// phone-sized Chromium with the CPU and network slowed down (Chromium because the throttles are
// DevTools features). Against BASE_URL, or without it a local production build on port 3210 with
// the local Supabase keys from .env.local. It measures; it isn't a pass/fail suite and isn't part
// of `pnpm test:all`.
import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

const PORT = 3210
const BASE_URL = process.env.BASE_URL

if (!BASE_URL && existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
  process.env.PERF_SUPABASE_URL ??= process.env.SUPABASE_URL
  process.env.PERF_SERVICE_ROLE_KEY ??= process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.PERF_EMAIL ??= 'perf@roomies.test'
}

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'perf.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 15 * 60_000,
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    // Traces and screenshots could show house data (see playwright.smoke.config.ts).
    trace: 'off',
    screenshot: 'off',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'phone-chromium', use: { ...devices['Pixel 7'] } }],
  webServer: BASE_URL
    ? undefined
    : {
        command: `pnpm build && pnpm start --port ${PORT}`,
        url: `http://localhost:${PORT}/sign-in`,
        reuseExistingServer: true,
        timeout: 240_000,
      },
})
