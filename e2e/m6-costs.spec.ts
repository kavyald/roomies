import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { aRoommate, anItem, ownerOnHouseTab } from './support'

test('a cost on an item is edited, then removed, and Spent this month and Activity follow (T57)', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await aRoommate(owner, 'Wren')
  const vacuum = await anItem(owner, { category: 'need', title: 'Vacuum' })
  await asOwner((db) =>
    db.query(
      `insert into costs (id, house_id, amount_cents, paid_by, note, item_id, created_by)
       values ($1, $2, 18900, $3, 'Dyson', $4, $3)`,
      [randomUUID(), owner.houseId, owner.userId, vacuum],
    ),
  )
  await page.reload()
  await expect(page.getByLabel('Spent this month')).toContainText('Spent this month: $189.00')

  await page.goto(`/h/${owner.houseId}/needs`)
  await page
    .getByRole('list', { name: 'Needs' })
    .getByRole('button', { name: /^Vacuum/ })
    .click()
  const detail = page.getByRole('dialog', { name: 'Vacuum' })
  await detail.getByRole('button', { name: 'Costs', exact: true }).click()
  const costs = detail.getByRole('region', { name: 'Costs' })
  await expect(costs).toContainText('$189.00 · You paid · Dyson')

  // Edit: the amount and who paid; the note clears.
  await costs.getByRole('button', { name: 'More for $189.00' }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  const edit = costs.getByRole('group', { name: 'Edit cost' })
  await expect(edit.getByLabel('Amount')).toHaveValue('189.00')
  await edit.getByLabel('Amount').fill('200')
  await edit.getByLabel('Who paid').selectOption({ label: 'Wren' })
  await edit.getByLabel('Note (optional)').fill('')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
  await expect(costs).toContainText('$200.00 · Wren paid')
  await expect(costs).not.toContainText('Dyson')

  // Remove, after a confirm.
  await costs.getByRole('button', { name: 'More for $200.00' }).click()
  await page.getByRole('menuitem', { name: 'Remove' }).click()
  const confirm = costs.getByRole('group', { name: 'Remove this cost?' })
  await expect(confirm).toContainText('$200.00 stops counting toward Spent this month')
  await confirm.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Removed $200.00.' })).toBeVisible()
  await expect(costs).not.toContainText('$200.00')
  await page.keyboard.press('Escape')

  await page.getByRole('link', { name: 'House' }).click()
  await expect(page.getByLabel('Spent this month')).toContainText('Spent this month: $0.00')

  await page.goto(`/h/${owner.houseId}/activity`)
  await expect(
    page.getByRole('button', { name: /Kavya removed the \$200\.00 cost for Vacuum/ }),
  ).toBeVisible()
  const edited = page.getByRole('button', { name: /Kavya edited the \$200\.00 cost for Vacuum/ })
  await expect(edited).toContainText('Was $189.00 · Changed who paid and the note')
})
