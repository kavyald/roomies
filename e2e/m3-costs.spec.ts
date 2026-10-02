import { expect, test } from '@playwright/test'
import { aRoommate, ownerOnHouseTab } from './support'

test('a grocery run in about six taps: finishing with $40 records one cost on the run and updates Spent this month', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await aRoommate(owner, 'Wren')
  await expect(page.getByLabel('Spent this month')).toContainText('Spent this month: $0.00')

  await page.goto(`/h/${owner.houseId}/needs`)
  const weNeed = page.getByLabel('We need…')
  for (const title of ['Milk', 'Eggs', 'Bread']) {
    await weNeed.fill(title)
    await weNeed.press('Enter')
    await expect(page.getByRole('list', { name: 'Needs' })).toContainText(title)
  }

  // The T44 Done-when, counted in taps: Start a run (1) → Start run, everything pre-checked (2) →
  // Milk, Eggs, Bread, one tap each (3–5) → the Spent field (6), type 40 → Finish (7).
  // Before T44 it was about 12: Start a run, check 3, Start run, check 3, Done, Finish, Amount,
  // Save and finish.
  await page.getByRole('button', { name: 'Start a run' }).click()
  const start = page.getByRole('dialog', { name: 'Start a run' })
  await start.getByRole('button', { name: 'Start run · 3 things' }).click()

  const run = page.getByRole('dialog', { name: "Kavya's run" })
  const rows = run.getByRole('list', { name: 'On this run' })
  for (const title of ['Milk', 'Eggs', 'Bread']) {
    await rows.getByRole('checkbox', { name: title }).click()
    await expect(rows.getByRole('checkbox', { name: title })).toBeChecked()
  }
  await expect(run).toContainText('3 of 3 done')
  await run.getByLabel('Spent (optional)').fill('40')
  await expect(run.getByLabel('Who paid')).toHaveValue(owner.userId)
  await run.getByRole('button', { name: 'Finish' }).click()
  const toast = page.getByRole('status').filter({ hasText: 'Finished. $40.00 noted.' })
  await expect(toast).toBeVisible()
  await expect(toast.getByRole('button', { name: 'Open Splitwise' })).toBeVisible()

  await page.getByRole('link', { name: 'House' }).click()
  await expect(page.getByLabel('Spent this month')).toContainText(
    'Spent this month: $40.00 · your share $20.00',
  )

  // A cost on an item, paid by someone else.
  await page.goto(`/h/${owner.houseId}/needs`)
  await weNeed.fill('Vacuum')
  await weNeed.press('Enter')
  await page
    .getByRole('list', { name: 'Needs' })
    .getByRole('button', { name: /^Vacuum/ })
    .click()
  const detail = page.getByRole('dialog', { name: 'Vacuum' })
  await detail.getByRole('button', { name: 'Costs', exact: true }).click()
  await detail.getByRole('button', { name: 'Add cost' }).click()
  await detail.getByLabel('Amount').fill('$189')
  await detail.getByLabel('Who paid').selectOption({ label: 'Wren' })
  await detail.getByRole('button', { name: 'Save cost' }).click()
  const costs = detail.getByRole('region', { name: 'Costs' })
  await expect(costs).toContainText('$189.00 · Wren paid')
  // The closed section still shows the total.
  await costs.getByRole('button', { name: 'Costs', exact: true }).click()
  await expect(
    costs.getByRole('button', { name: 'Costs', exact: true }),
  ).toHaveAccessibleDescription('$189.00')
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'House' }).click()
  await expect(page.getByLabel('Spent this month')).toContainText('Spent this month: $229.00')
})
