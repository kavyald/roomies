// T98: anyone in the house sets up a routine in Admin; Activity shows each change by its name.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { aRoommate, ownerOnHouseTab } from './support'

const sheetFor = (page: Page, name: string) => page.getByRole('dialog', { name })

const saved = async (page: Page, name: string) => {
  const sheet = sheetFor(page, name)
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(sheet).toBeHidden()
}

/** The first tap can land before the page hydrates; tap again. */
const opens = async (trigger: Locator, sheet: Locator) => {
  await expect(async () => {
    if (!(await sheet.isVisible())) await trigger.click()
    await expect(sheet).toBeVisible({ timeout: 2000 })
  }).toPass()
}

const lines = async (page: Page, houseId: string, text: string, count: number) => {
  await page.goto(`/h/${houseId}/activity`)
  await expect(page.getByText(text)).toHaveCount(count)
  await page.goto(`/h/${houseId}/admin`)
}

test('a member creates the first routine, assigns rooms, changes it and removes it; Activity shows each', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await aRoommate(owner, 'Sam')
  await page.reload()

  // Empty to start.
  await expect(page.getByText('No routines yet. Group rooms someone looks after')).toBeVisible()
  const newSheet = sheetFor(page, 'New routine')
  const add = page.getByRole('button', { name: 'Add a routine' })
  await opens(add, newSheet)

  // Create: name and icon; it starts weekly, takes turns, with me.
  await newSheet.getByRole('textbox', { name: 'Name' }).fill('Upstairs')
  await newSheet.getByRole('button', { name: 'Broom' }).click()
  await expect(newSheet.getByRole('button', { name: 'Weekly' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(newSheet.getByRole('button', { name: 'Kavya' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await newSheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(newSheet).toBeHidden()

  const routines = page.getByRole('list', { name: 'Routines' })
  const row = routines.getByRole('button', { name: /^Upstairs/ })
  await expect(row).toContainText('Weekly')
  await expect(row.getByRole('img', { name: /^Kavya/ })).toBeVisible()
  await expect(row.getByRole('img', { name: /^Sam/ })).toBeVisible()
  await lines(page, owner.houseId, 'Kavya added Upstairs', 1)

  // Assign a room.
  const sheet = sheetFor(page, 'Upstairs')
  await opens(row, sheet)
  await sheet.getByRole('checkbox', { name: 'Kitchen' }).check()
  await saved(page, 'Upstairs')
  await lines(page, owner.houseId, 'Kavya put Kitchen in Upstairs', 1)

  // How often.
  await opens(row, sheet)
  await sheet.getByRole('button', { name: 'Every 2 weeks' }).click()
  await expect(sheet.getByText('Who has it these two weeks')).toBeVisible()
  await saved(page, 'Upstairs')
  await expect(row).toContainText('Every 2 weeks')
  await lines(page, owner.houseId, 'Kavya changed Upstairs', 1)

  // Who has it this period.
  await opens(row, sheet)
  await sheet.getByRole('button', { name: 'Sam', exact: true }).click()
  await saved(page, 'Upstairs')
  await lines(page, owner.houseId, 'Kavya changed Upstairs', 2)

  // Always one person: only their avatar on the row.
  await opens(row, sheet)
  await sheet.getByRole('button', { name: 'Always one person' }).click()
  await saved(page, 'Upstairs')
  await expect(row.getByRole('img')).toHaveCount(1)
  await expect(row.getByRole('img', { name: /^Sam/ })).toBeVisible()
  await lines(page, owner.houseId, 'Kavya changed Upstairs', 3)

  // Remove: it says where the chores go first.
  await opens(row, sheet)
  await sheet.getByRole('button', { name: 'Remove this routine' }).click()
  const confirm = sheet.getByRole('group', { name: 'Remove this routine?' })
  await expect(confirm).toContainText('Upkeep')
  await confirm.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('No routines yet. Group rooms someone looks after')).toBeVisible()
  await lines(page, owner.houseId, 'Kavya removed Upstairs', 1)
})
