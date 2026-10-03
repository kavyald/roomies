import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { anItem, ownerOnHouseTab } from './support'

test('an edit saved over someone else’s newer one is turned away with the latest shown (T50)', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  const latch = await anItem(owner, { category: 'task', title: 'Fix the latch' })
  await page.goto(`/h/${owner.houseId}/i/${latch}`)
  const detail = page.getByRole('dialog', { name: 'Fix the latch' })
  await detail.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit task' })
  await expect(edit.getByLabel('What needs doing?')).toHaveValue('Fix the latch')

  // Meanwhile a roommate renames it (the touch_updated_at trigger moves its version on).
  await asOwner((db) =>
    db.query("update items set title = 'Fix the front latch' where id = $1", [latch]),
  )

  await edit.getByLabel('What needs doing?').fill('Fix the latch today')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: "Someone just changed this. Here's the latest." }),
  ).toBeVisible()
  // Their change stands, and the sheet shows it.
  await expect(page.getByRole('dialog', { name: 'Fix the front latch' })).toBeVisible()
  const title = await asOwner((db) => db.query('select title from items where id = $1', [latch]))
  expect(title.rows[0].title).toBe('Fix the front latch')
})
