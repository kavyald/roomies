// T93, T109: anyone, the organizer included, picks, changes or clears their own bedroom on You;
// House → Roommates shows everyone's room.
import { expect, test } from '@playwright/test'
import { anOwner, dismissInstallGuide, signIn } from './support'

test('the organizer picks a bedroom on You, changes it, then clears it', async ({ page }) => {
  const owner = await anOwner('Kavya') // set up the old way: no bedroom
  await signIn(page, owner.email)
  await dismissInstallGuide(page)
  await page.goto(`/h/${owner.houseId}/me`)

  const room = page.getByRole('radiogroup', { name: 'Your room' })
  await expect(room.getByRole('radio', { name: 'Not yet' })).toBeChecked()

  // The first tap can land before the page hydrates; tap again.
  await expect(async () => {
    if (!(await page.getByText('Your room is Fire now.').isVisible())) {
      await room.getByRole('radio', { name: 'Fire' }).click()
    }
    await expect(page.getByText('Your room is Fire now.')).toBeVisible({ timeout: 2000 })
  }).toPass()
  await expect(room.getByRole('radio', { name: 'Fire' })).toBeChecked()

  await room.getByRole('radio', { name: 'Water' }).click()
  await expect(page.getByText('Your room is Water now.')).toBeVisible()
  await expect(room.getByRole('radio', { name: 'Water' })).toBeChecked()

  // Roommates shows it, and your own sheet there no longer offers the bedrooms.
  await page.goto(`/h/${owner.houseId}/house/roommates`)
  const roommates = page.getByRole('list', { name: 'Roommates' })
  await expect(roommates.getByRole('button', { name: /Kavya.*Water room/ })).toBeVisible()
  const sheet = page.getByRole('dialog', { name: 'You' })
  await expect(async () => {
    if (!(await sheet.isVisible())) await roommates.getByRole('button', { name: /Kavya/ }).click()
    await expect(sheet).toBeVisible({ timeout: 2000 })
  }).toPass()
  await expect(sheet.getByRole('radiogroup', { name: 'Your room' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.goto(`/h/${owner.houseId}/me`)
  await room.getByRole('radio', { name: 'Not yet' }).click()
  await expect(page.getByText('No bedroom for now.')).toBeVisible()

  await page.goto(`/h/${owner.houseId}/activity`)
  const feed = page.getByRole('list', { name: 'Today' })
  await expect(feed).toContainText('Kavya moved into Fire')
  await expect(feed).toContainText('Kavya moved into Water')
  await expect(feed).toContainText('Kavya has no bedroom set for now')
})
