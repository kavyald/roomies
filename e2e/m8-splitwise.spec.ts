// T89: any roommate links the house's Splitwise group in Admin; a cost's Splitwise icon opens it,
// and is highlighted once sent.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { anItem, ownerOnHouseTab } from './support'

const GROUP = 'https://secure.splitwise.com/#/groups/12345678'

test('link the Splitwise group, then a cost opens it and shows it was sent', async ({
  page,
  context,
}) => {
  const owner = await ownerOnHouseTab(page)
  const vacuum = await anItem(owner, { category: 'need', title: 'Vacuum' })
  await asOwner((db) =>
    db.query(
      `insert into costs (id, house_id, amount_cents, paid_by, note, item_id, created_by)
       values ($1, $2, 18900, $3, 'Dyson', $4, $3)`,
      [randomUUID(), owner.houseId, owner.userId, vacuum],
    ),
  )
  // Splitwise itself is never loaded: the test only checks where the icon goes.
  await context.route('https://secure.splitwise.com/**', (r) =>
    r.fulfill({ status: 200, body: 'Splitwise' }),
  )

  // Admin → Splitwise: a link that isn't a group is explained, then a pasted one is saved.
  const row = page.getByRole('list', { name: 'Splitwise' }).getByRole('button')
  await expect(row).toContainText("Add your group's link")
  const sheet = page.getByRole('dialog', { name: 'Splitwise group' })
  await expect(async () => {
    if (!(await sheet.isVisible())) await row.click()
    await expect(sheet).toBeVisible({ timeout: 2000 })
  }).toPass()
  const link = sheet.getByLabel('Group link')
  await link.fill('https://example.com/groups/1')
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(sheet).toContainText("That isn't a Splitwise group link.")
  await expect(link).toHaveAttribute('aria-invalid', 'true')
  await link.fill('splitwise.com/groups/12345678')
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(row).toContainText('Costs open your group')

  // The cost's icon: not sent yet, then it opens the group and is highlighted.
  await page.goto(`/h/${owner.houseId}/needs`)
  await page
    .getByRole('list', { name: 'Needs' })
    .getByRole('button', { name: /^Vacuum/ })
    .click()
  const detail = page.getByRole('dialog', { name: 'Vacuum' })
  const costs = detail.getByRole('region', { name: 'Costs' })
  const popup = context.waitForEvent('page')
  await costs.getByRole('button', { name: 'Add $189.00 to Splitwise' }).click()
  expect((await popup).url()).toBe(GROUP)
  await expect(
    costs.getByRole('button', { name: 'Added to Splitwise. Add $189.00 again' }),
  ).toBeVisible()

  // Activity says who linked it, under Money.
  await page.goto(`/h/${owner.houseId}/activity`)
  await page.getByRole('button', { name: 'Money' }).click()
  await expect(page.getByText('Kavya linked the Splitwise group')).toBeVisible()
})
