// T69 in desktop Chrome: the calendar and clock icons open the pickers. Skipped where Playwright's
// Chromium isn't installed (`pnpm exec playwright install chromium`); the journeys are WebKit.
import { existsSync } from 'node:fs'
import { chromium, devices, test } from '@playwright/test'
import { desktopPickerJourney } from './date-time-fields'

test.use({ ...devices['Desktop Chrome'] })

test('Chrome on a computer: the calendar and clock icons open the pickers', async ({ page }) => {
  test.skip(!existsSync(chromium.executablePath()), 'Chromium is not installed')
  await desktopPickerJourney(page)
})
