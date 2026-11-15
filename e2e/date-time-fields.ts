// Shared by the m8-date-time-fields specs (T69): one per desktop browser, since a spec file runs
// in one browser. Not a spec itself.
import { expect, type Page } from '@playwright/test'
import { anOwner, signIn } from './support'

type Picks = { __pickers?: string[] }

/**
 * Records each showPicker call as "<input id>:ok" or "<input id>:<error name>", still opening the
 * real picker, and keeps the install guide and the notifications prompt out of the way.
 */
const recordPickers = (page: Page) =>
  page.addInitScript(() => {
    try {
      localStorage.setItem('roomies.pushPromptDone', String(Date.now()))
      localStorage.setItem('roomies.installGuideDismissedAt', String(Date.now()))
    } catch {
      // about:blank has no storage.
    }
    const w = window as Window & Picks
    const show = HTMLInputElement.prototype.showPicker
    HTMLInputElement.prototype.showPicker = function (this: HTMLInputElement) {
      try {
        show.call(this)
        w.__pickers = [...(w.__pickers ?? []), `${this.id}:ok`]
      } catch (e) {
        w.__pickers = [...(w.__pickers ?? []), `${this.id}:${(e as Error).name}`]
        throw e
      }
    }
  })

export const pickersOpened = (page: Page) =>
  page.evaluate(() => (window as Window & Picks).__pickers ?? [])

/** Signs in as a fresh owner and opens the Add sheet's task form with its date and time. */
export const openTaskForm = async (page: Page) => {
  await recordPickers(page)
  const owner = await anOwner('Kavya')
  await signIn(page, owner.email)
  await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
  // The + is on the Tasks tab and goes straight to the task form (T107).
  await page.goto(`/h/${owner.houseId}/tasks`)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'A task' })
  await sheet.getByLabel('What needs doing?').fill('Plumber comes')
  await sheet.getByRole('button', { name: 'More options' }).click()
  return {
    sheet,
    date: sheet.getByLabel('Date', { exact: true }),
    time: sheet.getByLabel('Time', { exact: true }),
    calendar: sheet.getByRole('button', { name: 'Open calendar' }),
    clock: sheet.getByRole('button', { name: 'Open clock' }),
  }
}

/** With a mouse: the calendar and clock icons open the browser's pickers, and typing still works. */
export const desktopPickerJourney = async (page: Page) => {
  const { date, time, calendar, clock } = await openTaskForm(page)
  await expect(clock).toBeDisabled() // no time without a date

  await calendar.click()
  await expect.poll(() => pickersOpened(page)).toEqual(['item-date:ok'])
  await expect(date).toBeFocused()
  await date.fill('2026-12-05')

  await clock.click()
  await expect.poll(() => pickersOpened(page)).toEqual(['item-date:ok', 'item-time:ok'])
  await expect(time).toBeFocused()
  await time.fill('19:30')
  await expect(date).toHaveValue('2026-12-05')
  await expect(time).toHaveValue('19:30')
}
