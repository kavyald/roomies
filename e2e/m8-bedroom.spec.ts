// T93: anyone, the organizer included, picks, changes or clears their own bedroom from Roommates.
import { expect, test } from '@playwright/test'
import { anOwner, dismissInstallGuide, signIn } from './support'

test('the organizer picks a bedroom, changes it, then clears it', async ({ page }) => {
  const owner = await anOwner('Kavya') // set up the old way: no bedroom
  await signIn(page, owner.email)
  await dismissInstallGuide(page)
  await page.goto(`/h/${owner.houseId}/admin`)

  const roommates = page.getByRole('list', { name: 'Roommates' })
  const sheet = page.getByRole('dialog', { name: 'You' })
  const room = sheet.getByRole('radiogroup', { name: 'Your room' })
  await expect(async () => {
    if (!(await sheet.isVisible())) await roommates.getByRole('button', { name: /Kavya/ }).click()
    await expect(room).toBeVisible({ timeout: 2000 })
  }).toPass()
  await expect(room.getByRole('radio', { name: 'Not yet' })).toBeChecked()

  await room.getByRole('radio', { name: 'Fire' }).click()
  await expect(page.getByText('Your room is Fire now.')).toBeVisible()
  await expect(room.getByRole('radio', { name: 'Fire' })).toBeChecked()

  await room.getByRole('radio', { name: 'Water' }).click()
  await expect(page.getByText('Your room is Water now.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(roommates.getByRole('button', { name: /Kavya.*Water room/ })).toBeVisible()

  await roommates.getByRole('button', { name: /Kavya/ }).click()
  await room.getByRole('radio', { name: 'Not yet' }).click()
  await expect(page.getByText('No bedroom for now.')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto(`/h/${owner.houseId}/activity`)
  const feed = page.getByRole('list', { name: 'Today' })
  await expect(feed).toContainText('Kavya moved into Fire')
  await expect(feed).toContainText('Kavya moved into Water')
  await expect(feed).toContainText('Kavya has no bedroom set for now')
})
