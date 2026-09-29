import { expect, test } from '@playwright/test'
import { ownerOnHouseTab } from './support'

test('the super and landlord are saved, with their numbers', async ({ page }) => {
  await ownerOnHouseTab(page)
  await expect(page.getByText('No contacts yet. Add the super or the landlord.')).toBeVisible()

  for (const [name, phone] of [
    ['Super', '(555) 010-2231'],
    ['Landlord', '(555) 010-4478'],
  ]) {
    await page.getByRole('button', { name: 'Add a contact' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add a contact' })
    await sheet.getByLabel('Name').fill(name!)
    await sheet.getByLabel('Phone (optional)').fill(phone!)
    await sheet.getByRole('button', { name: 'Add' }).click()
    await expect(sheet).toBeHidden()
  }

  await page.reload()
  const contacts = page.getByRole('list', { name: 'Contacts' })
  await expect(contacts.getByRole('listitem')).toHaveCount(2)
  await expect(contacts).toContainText('Landlord(555) 010-4478')
  await expect(contacts).toContainText('Super(555) 010-2231')
  await expect(contacts.getByRole('button', { name: "Copy Super's number" })).toBeVisible()
})

test('a room can be renamed, and it shows in the activity log', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  await page
    .getByRole('list', { name: 'Basement' })
    .getByRole('button', { name: 'Craft room' })
    .click()
  const sheet = page.getByRole('dialog', { name: 'Craft room' })
  await sheet.getByLabel('Name').fill('Studio')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('list', { name: 'Basement' })).toContainText('Studio')

  await page.goto(`/h/${owner.houseId}/activity`)
  await expect(page.getByRole('list', { name: 'Activity' })).toContainText(
    'Kavya renamed Craft room to Studio',
  )
})
