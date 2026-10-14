import { expect, test, type Page } from '@playwright/test'
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

/** Opens Admin → Rooms: one row, then a sheet of plain names by group (T66). */
const openRooms = async (page: Page) => {
  const row = page.getByRole('list', { name: 'Rooms' }).getByRole('button')
  await expect(row).toHaveCount(1)
  await row.click()
  return page.getByRole('dialog', { name: 'Rooms' })
}

test('rooms are one row that opens a sheet in three groups, and a room can be renamed there (shown in the activity log)', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  const sheet = await openRooms(page)
  const bedrooms = sheet.getByRole('list', { name: 'Bedrooms' })
  await expect(bedrooms.getByRole('button')).toHaveCount(4)
  await expect(bedrooms.getByRole('button', { name: 'Fire, bedroom', exact: true })).toBeVisible()
  await expect(sheet.getByRole('list', { name: 'Bathrooms' }).getByRole('button')).toHaveCount(3)
  await expect(sheet.getByRole('list', { name: 'Spaces' }).getByRole('button')).toHaveCount(10)
  await expect(sheet.getByRole('list').locator('svg')).toHaveCount(0) // plain names, no room icons

  const spaces = sheet.getByRole('list', { name: 'Spaces' })
  await spaces.getByRole('button', { name: 'Craft room, shared space', exact: true }).click()
  const edit = spaces.getByRole('group', { name: 'Edit Craft room, shared space' })
  await edit.getByLabel('Name').fill('Studio')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Renamed.' })).toBeVisible()
  await expect(
    spaces.getByRole('button', { name: 'Studio, shared space', exact: true }),
  ).toBeVisible()

  await page.goto(`/h/${owner.houseId}/activity`)
  await expect(page.getByRole('list', { name: 'Today' })).toContainText(
    'Kavya renamed Craft room to Studio',
  )
})

test('a room moves earlier or later within its group, and stays there', async ({ page }) => {
  await ownerOnHouseTab(page)
  let sheet = await openRooms(page)
  const bedrooms = () => sheet.getByRole('list', { name: 'Bedrooms' })
  const names = () =>
    bedrooms()
      .getByRole('listitem')
      .evaluateAll((li) => li.map((l) => l.querySelector('button')?.textContent ?? 'editing'))
  await expect.poll(names).toEqual(['Air', 'Fire', 'Water', 'Earth'])

  await bedrooms().getByRole('button', { name: 'Earth, bedroom', exact: true }).click()
  const earth = bedrooms().getByRole('group', { name: 'Edit Earth, bedroom' })
  await earth.getByRole('button', { name: 'Move earlier' }).click()
  await expect(earth.getByRole('button', { name: 'Move earlier' })).toBeEnabled() // saved
  await earth.getByRole('button', { name: 'Cancel' }).click()
  await expect.poll(names).toEqual(['Air', 'Fire', 'Earth', 'Water'])

  await page.reload()
  sheet = await openRooms(page)
  await expect.poll(names).toEqual(['Air', 'Fire', 'Earth', 'Water'])
  await bedrooms().getByRole('button', { name: 'Air, bedroom', exact: true }).click()
  await bedrooms()
    .getByRole('group', { name: 'Edit Air, bedroom' })
    .getByRole('button', { name: 'Move earlier' })
    .click()
  await expect(page.getByText("It's already first in bedrooms.")).toBeVisible()
})
