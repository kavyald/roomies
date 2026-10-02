import { expect, test } from '@playwright/test'
import { aRoommate, ownerOnHouseTab } from './support'

test('finishing a grocery run with $42.50 records one cost on the run and updates Spent this month', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await aRoommate(owner, 'Wren')
  await expect(page.getByLabel('Spent this month')).toContainText('Spent this month: $0.00')

  await page.goto(`/h/${owner.houseId}/needs`)
  const weNeed = page.getByLabel('We need…')
  for (const title of ['Milk', 'Eggs']) {
    await weNeed.fill(title)
    await weNeed.press('Enter')
    await expect(page.getByRole('list', { name: 'Needs' })).toContainText(title)
  }
  await page.getByRole('button', { name: 'Start a run' }).click()
  const start = page.getByRole('dialog', { name: 'Start a run' })
  await start.getByRole('button', { name: 'Select all' }).click()
  await start.getByLabel('Title (optional)').fill('Groceries')
  await start.getByRole('button', { name: 'Start run' }).click()

  const run = page.getByRole('dialog', { name: 'Groceries' })
  await run.getByRole('button', { name: 'Select all' }).click()
  await run.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(run).toContainText('2 of 2 done')
  await run.getByRole('button', { name: 'Finish' }).click()
  await run.getByLabel('Amount').fill('42.50')
  await run.getByRole('button', { name: 'Save and finish' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Finished. Thanks!' })).toBeVisible()

  await page.getByRole('link', { name: 'House' }).click()
  await expect(page.getByLabel('Spent this month')).toContainText(
    'Spent this month: $42.50 · your share $21.25',
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
  await expect(page.getByLabel('Spent this month')).toContainText('Spent this month: $231.50')
})
