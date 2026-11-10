import { expect, test } from '@playwright/test'
import { addWithThreeTaps, ownerOnHouseTab } from './support'

test('a need, a chore, and a task can each be added with just a title in 3 taps, and opened', async ({
  page,
}) => {
  await ownerOnHouseTab(page)

  for (const [tile, title, action] of [
    ['A need', 'Paper towels', 'Got it'],
    ['A chore', 'Water the plants', 'Took care of it'],
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

test('the detail sheet shows Edit and Delete as header icons, and the extras closed', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await addWithThreeTaps(page, 'A task', 'Descale the kettel')
  await page
    .getByRole('status')
    .filter({ hasText: 'Added.' })
    .getByRole('button', { name: 'Open' })
    .click()
  let detail = page.getByRole('dialog', { name: 'Descale the kettel' })
  await expect(detail.getByRole('button', { name: 'Done', exact: true })).toBeVisible()
  // Edit and Delete are the Pencil and Trash2 icons in the header (T68), not behind a menu.
  await expect(detail.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(detail.getByRole('button', { name: 'More actions' })).toHaveCount(0)

  // Costs is open, right under the main button, with Add cost in view (T104).
  const costs = detail.getByRole('region', { name: 'Costs' })
  await expect(costs.getByRole('button', { name: 'Add cost' })).toBeVisible()

  // The Edit sheet has the same Costs section under the form (T104).
  await detail.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(
    page
      .getByRole('dialog', { name: 'Edit task' })
      .getByRole('region', { name: 'Costs' })
      .getByRole('button', { name: 'Add cost' }),
  ).toBeVisible()
  await page.getByLabel('What needs doing?').fill('Descale the kettle')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
  detail = page.getByRole('dialog', { name: 'Descale the kettle' })

  // Delete (PRD D30): asks first, then the toast offers Undo; nothing promises a window.
  await detail.getByRole('button', { name: 'Delete', exact: true }).click()
  const confirm = detail.getByRole('group', { name: 'Delete this?' })
  await expect(confirm).toContainText('You can undo it right after.')
  await confirm.getByRole('button', { name: 'Keep it' }).click()
  await expect(confirm).toBeHidden()
  await detail.getByRole('button', { name: 'Delete', exact: true }).click()
  await detail
    .getByRole('group', { name: 'Delete this?' })
    .getByRole('button', { name: 'Delete' })
    .click()
  const deleted = page.getByRole('status').filter({ hasText: 'Deleted.' })
  await expect(deleted).toBeVisible()
  await expect(detail).toBeHidden()
  await deleted.getByRole('button', { name: 'Undo' }).click()

  const tasks = page.getByRole('list', { name: 'Tasks' })
  await page.getByRole('link', { name: 'Tasks' }).click() // in-app, so the Undo request finishes
  const card = tasks.getByRole('button', { name: 'Descale the kettle', exact: true })
  await expect(card).toBeVisible()

  // Deleted again, it can still be opened from Activity and brought back.
  await card.click()
  detail = page.getByRole('dialog', { name: 'Descale the kettle' })
  await detail.getByRole('button', { name: 'Delete', exact: true }).click()
  await detail
    .getByRole('group', { name: 'Delete this?' })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(page.getByRole('status').filter({ hasText: 'Deleted.' })).toBeVisible()
  await expect(card).toHaveCount(0)
  await page.goto(`/h/${owner.houseId}/activity`)
  // Deleted twice (the first was undone), so two lines; the newest is first.
  await page
    .getByRole('button', { name: /Kavya deleted Descale the kettle/ })
    .first()
    .click()
  detail = page.getByRole('dialog', { name: 'Descale the kettle' })
  await expect(detail).toContainText('Task · Deleted')
  await expect(detail.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
  await detail.getByRole('button', { name: 'Bring it back' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Brought back.' })).toBeVisible()
  await expect(detail).not.toContainText('Deleted')
})
