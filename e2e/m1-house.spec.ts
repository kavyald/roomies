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

test('rooms are a grid in three groups, and a room can be renamed (shown in the activity log)', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  const bedrooms = page.getByRole('list', { name: 'Bedrooms' })
  await expect(bedrooms.getByRole('button')).toHaveCount(4)
  await expect(bedrooms.getByRole('button', { name: 'Fire, bedroom', exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Bathrooms' }).getByRole('button')).toHaveCount(3)
  await expect(page.getByRole('list', { name: 'Spaces' }).getByRole('button')).toHaveCount(10)

  await page
    .getByRole('list', { name: 'Spaces' })
    .getByRole('button', { name: 'Craft room, shared space', exact: true })
    .click()
  const sheet = page.getByRole('dialog', { name: 'Craft room' })
  await sheet.getByLabel('Name').fill('Studio')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('list', { name: 'Spaces' })).toContainText('Studio')

  await page.goto(`/h/${owner.houseId}/activity`)
  await expect(page.getByRole('list', { name: 'Today' })).toContainText(
    'Kavya renamed Craft room to Studio',
  )
})

test('a room moves earlier or later within its group, and stays there', async ({ page }) => {
  await ownerOnHouseTab(page)
  const bedrooms = page.getByRole('list', { name: 'Bedrooms' })
  const names = () => bedrooms.getByRole('button').evaluateAll((bs) => bs.map((b) => b.textContent))
  await expect.poll(names).toEqual(['Air', 'Fire', 'Water', 'Earth'])

  await bedrooms.getByRole('button', { name: 'Earth, bedroom', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Earth' })
  await sheet.getByRole('button', { name: 'Move earlier' }).click()
  await expect(sheet.getByRole('button', { name: 'Move earlier' })).toBeEnabled() // saved
  await page.keyboard.press('Escape') // the open sheet hides the page from the accessibility tree
  await expect(sheet).toBeHidden()
  await expect.poll(names).toEqual(['Air', 'Fire', 'Earth', 'Water'])

  await page.reload()
  await expect.poll(names).toEqual(['Air', 'Fire', 'Earth', 'Water'])
  await bedrooms.getByRole('button', { name: 'Air, bedroom', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Air' })
    .getByRole('button', { name: 'Move earlier' })
    .click()
  await expect(page.getByText("It's already first in bedrooms.")).toBeVisible()
})
