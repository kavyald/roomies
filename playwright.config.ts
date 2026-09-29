// End-to-end journeys on the iPhone profile (TESTING.md §2). Runs a production build against local
// Supabase; set BASE_URL to run against a deployed app instead (E4, Q5).
import { defineConfig, devices } from '@playwright/test'

const PORT = 3210
const BASE_URL = process.env.BASE_URL

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block', // the shell cache is tested separately; keep journeys hermetic
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
