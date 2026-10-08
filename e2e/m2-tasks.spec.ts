import { expect, test } from '@playwright/test'
import { addWithThreeTaps, ownerOnHouseTab } from './support'

test("an existing task is handed to the super later, and shows under Outside help with the super's number", async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await addWithThreeTaps(page, 'A task', 'Radiator clanking')
  await page.goto(`/h/${owner.houseId}/tasks`)

  // Nothing needs outside help yet.
  await page.getByRole('button', { name: 'Outside help' }).click()
  await expect(page.getByText('Nothing is waiting on outside help.')).toBeVisible()

  // Later: open the task and hand it to the super, who isn't a contact yet.
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page
    .getByRole('list', { name: 'Tasks' })
    .getByRole('button', { name: /^Radiator clanking/ })
    .click()
  const detail = page.getByRole('dialog', { name: 'Radiator clanking' })
  await expect(detail).toContainText('One of us')
  await detail.getByRole('button', { name: 'Needs outside help?' }).click()
  await detail.getByRole('button', { name: 'Someone new' }).click()
  await detail.getByLabel('Name').fill('Super')
  await detail.getByLabel('Phone (optional)').fill('(555) 010-2231')
  await detail.getByRole('button', { name: 'Save and hand it over' }).click()
  await expect(detail).toContainText('Super(555) 010-2231')
  await expect(detail.getByRole('button', { name: 'Copy' })).toBeVisible()
  await page.keyboard.press('Escape')

  // It's under Outside help now, marked as the super's.
  await page.getByRole('button', { name: 'Outside help' }).click()
  const list = page.getByRole('list', { name: 'Tasks' })
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list).toContainText('Handled by: Super')

  // And back to "One of us" takes it off that list.
  await list.getByRole('button', { name: /^Radiator clanking/ }).click()
  await detail.getByRole('button', { name: 'Change' }).click()
  await detail.getByRole('radio', { name: 'One of us' }).click()
  await expect(detail).toContainText('One of us')
  await page.keyboard.press('Escape')
  await expect(page.getByText('Nothing is waiting on outside help.')).toBeVisible()
})

test('Mine shows only my tasks, and Done takes a task off the list with undo', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  await addWithThreeTaps(page, 'A task', 'Renew renters insurance')
  await page.goto(`/h/${owner.houseId}/tasks`)
  await page.getByRole('button', { name: 'Mine' }).click()
  await expect(page.getByText("Nothing's on you right now.")).toBeVisible()
  await page.getByRole('button', { name: 'All', exact: true }).click()

  await page.getByRole('button', { name: 'Done: Renew renters insurance' }).click()
  const toast = page.getByRole('status').filter({ hasText: 'Done. 💛' })
  await expect(toast).toBeVisible()
  await expect(page.getByRole('list', { name: 'Tasks' })).toHaveCount(0)
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('list', { name: 'Tasks' })).toContainText('Renew renters insurance')
})
