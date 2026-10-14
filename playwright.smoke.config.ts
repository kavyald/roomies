// The smoke suite (TESTING.md §5, DEPLOYMENT §5): e2e/smoke.spec.ts against a deployed site at
// BASE_URL (Q5 runs it after each staging deploy), or, without BASE_URL, against a local production
// build on port 3210 like `pnpm test:e2e`, with the local Supabase keys from .env.local.
import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

const PORT = 3210
const BASE_URL = process.env.BASE_URL

if (!BASE_URL && existsSync('.env.local')) {
  // Local mode: the smoke house lives in local Supabase. Explicit SMOKE_* values still win.
  process.loadEnvFile('.env.local')
  process.env.SMOKE_SUPABASE_URL ??= process.env.SUPABASE_URL
  process.env.SMOKE_SERVICE_ROLE_KEY ??= process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SMOKE_EMAIL ??= 'smoke@roomies.test'
}

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'smoke.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    // Traces and screenshots could show house data, and CI artifacts on a public repo are public.
    trace: 'off',
    screenshot: 'off',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'iphone', use: { ...devices['iPhone 15'] } }],
  webServer: BASE_URL
    ? undefined
    : {
        command: `pnpm build && pnpm start --port ${PORT}`,
        url: `http://localhost:${PORT}/sign-in`,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
})
