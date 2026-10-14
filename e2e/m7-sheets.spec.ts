// T80: a form sheet saves with the check in its header (no bottom Save, no X), and every sheet
// dismisses by swipe, backdrop, Escape, or the drag handle (a button named "Close" for VoiceOver).
import { expect, test, type Page } from '@playwright/test'
import { ownerOnHouseTab } from './support'

const openAddSheet = async (page: Page) => {
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Add something' })
  await expect(sheet).toBeVisible()
  return sheet
}

test('the header check saves a form sheet; there is no bottom Save and no X', async ({ page }) => {
  await ownerOnHouseTab(page)
  await openAddSheet(page)
  await page.getByRole('button', { name: /^A need/ }).click()
  const sheet = page.getByRole('dialog', { name: 'A need' })
  const check = sheet.getByRole('button', { name: 'Add', exact: true })

  // One commit button, in the header beside the title, at least 44px; off until there's a title.
  await expect(check).toHaveCount(1)
  await expect(check).toBeDisabled()
  const height = await check.evaluate((el: HTMLElement) => el.offsetHeight)
  expect(height).toBeGreaterThanOrEqual(44)
  const title = await sheet.getByRole('heading', { name: 'A need' }).boundingBox()
  const box = await check.boundingBox()
  expect(box!.y).toBeLessThan(title!.y + title!.height)
  await expect(sheet.getByRole('button', { name: 'Save' })).toHaveCount(0)

  await sheet.getByLabel('What do we need?').fill('Dish soap')
  await check.click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: 'Added.' })).toBeVisible()

  // Enter in the title still submits through the header check.
  await openAddSheet(page)
  await page.getByRole('button', { name: /^A need/ }).click()
  await sheet.getByLabel('What do we need?').fill('Sponges')
  await page.keyboard.press('Enter')
  await expect(sheet).toBeHidden()
})

test('a sheet dismisses by Escape, the Close handle, the backdrop, and a swipe down', async ({
  page,
}) => {
  await ownerOnHouseTab(page)

  let sheet = await openAddSheet(page)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  // The handle is a real button, so screen readers and keyboards can close the sheet.
  sheet = await openAddSheet(page)
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toBeHidden()

  sheet = await openAddSheet(page)
  await page.mouse.click(187, 20) // the dimmed page above the sheet
  await expect(sheet).toBeHidden()

  sheet = await openAddSheet(page)
  const heading = (await sheet.getByRole('heading', { name: 'Add something' }).boundingBox())!
  await page.mouse.move(heading.x + 20, heading.y + 5)
  await page.mouse.down()
  await page.mouse.move(heading.x + 20, heading.y + 400, { steps: 15 })
  await page.mouse.up()
  await expect(sheet).toBeHidden()
})
