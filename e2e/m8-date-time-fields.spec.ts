// T69: on a desktop browser the date and time fields' icons open the picker; on iPhone a tap on
// the field opens iOS's own picker, as before, and there's no icon. This file is WebKit (Safari on
// macOS, and the iPhone profile); m8-date-time-fields-chromium covers Chrome.
import { devices, expect, test } from '@playwright/test'
import { desktopPickerJourney, openTaskForm, pickersOpened } from './date-time-fields'

test.use({ ...devices['Desktop Safari'] })

test('Safari on a Mac: the calendar and clock icons open the pickers', async ({ page }) => {
  await desktopPickerJourney(page)
})

test.describe('iPhone', () => {
  // The iPhone profile's context options (the browser stays WebKit, set above).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { defaultBrowserType, ...iphone } = devices['iPhone 15']
  test.use(iphone)

  test('a tap on the field opens the native picker; no icons', async ({ page }) => {
    const { date, calendar, clock } = await openTaskForm(page)
    await expect(calendar).toBeHidden()
    await expect(clock).toBeHidden()
    await date.tap()
    await expect(date).toBeFocused()
    expect(await pickersOpened(page)).toEqual([])
  })
})
