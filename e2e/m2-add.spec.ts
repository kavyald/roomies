import { expect, test } from '@playwright/test'
import { addWithThreeTaps, ownerOnHouseTab } from './support'

test('a need, a chore, and a task can each be added with just a title in 3 taps, and opened', async ({
  page,
}) => {
  await ownerOnHouseTab(page)

  for (const [tile, title, action] of [
    ['A need', 'Paper towels', 'Got it'],
    ['A chore', 'Water the plants', 'Did it'],
    ['A task', 'Fix the window latch', 'Done'],
  ] as const) {
    await addWithThreeTaps(page, tile, title)
    const toast = page.getByRole('status').filter({ hasText: 'Added.' })
    await expect(toast).toBeVisible()
    await toast.getByRole('button', { name: 'Open' }).click()
    const detail = page.getByRole('dialog', { name: title })
    await expect(detail).toBeVisible()
    await expect(detail.getByRole('button', { name: action, exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(detail).toBeHidden()
  }
})

test('adding a need that is already on the list points to it', async ({ page }) => {
  await ownerOnHouseTab(page)
  await addWithThreeTaps(page, 'A need', 'Tomatoes')
  await expect(page.getByRole('status').filter({ hasText: 'Added.' })).toBeVisible()
  await addWithThreeTaps(page, 'A need', 'tomatoes')
  const toast = page.getByRole('status').filter({ hasText: "That's already on the list." })
  await expect(toast).toBeVisible()
  await toast.getByRole('button', { name: 'Open' }).click()
  await expect(page.getByRole('dialog', { name: 'Tomatoes' })).toBeVisible()
})

test('a task gets its details from "More options", and the detail sheet shows them', async ({
  page,
}) => {
  await ownerOnHouseTab(page)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: /^A task/ }).click()
  const sheet = page.getByRole('dialog', { name: 'A task' })
  await sheet.getByLabel('What needs doing?').fill('Leak under the sink')
  await sheet.getByRole('button', { name: 'More options' }).click()
  await sheet.getByLabel('Room').selectOption({ label: 'Kitchen' })
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await page
    .getByRole('status')
    .filter({ hasText: 'Added.' })
    .getByRole('button', { name: 'Open' })
    .click()
  const detail = page.getByRole('dialog', { name: 'Leak under the sink' })
  await expect(detail).toContainText('Kitchen')
  await expect(detail).toContainText('One of us')

  await detail.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Done. 💛' })).toBeVisible()
  await expect(detail.getByRole('button', { name: 'Not done after all' })).toBeVisible()
})
