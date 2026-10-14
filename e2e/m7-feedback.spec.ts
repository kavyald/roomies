// T91: Admin's feedback icon sends the owner a bug, an idea or praise, stamped by the server with
// who sent it, from which house, the app version and the browser.
import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { ownerOnHouseTab } from './support'

test('a bug sent from Admin is stored with the sender, house, version and browser', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible()

  const sheet = page.getByRole('dialog', { name: 'Feedback' })
  const icon = page.getByRole('button', { name: 'Send feedback' })
  await expect(icon).toHaveText('')
  // The first tap can land before the page hydrates; tap again.
  await expect(async () => {
    if (!(await sheet.isVisible())) await icon.click()
    await expect(sheet).toBeVisible({ timeout: 2000 })
  }).toPass()

  await expect(sheet.getByRole('button', { name: 'Idea 💡' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await sheet.getByRole('button', { name: 'Bug 🐞' }).click()
  await sheet.getByRole('textbox', { name: 'Message' }).fill('The calendar is blank on Sundays')
  await sheet.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Thanks for telling us!')).toBeVisible()
  await expect(sheet).toBeHidden()

  const { rows } = await asOwner((db) =>
    db.query(
      'select user_id, kind, message, app_version, user_agent from feedback where house_id = $1',
      [owner.houseId],
    ),
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    user_id: owner.userId,
    kind: 'bug',
    message: 'The calendar is blank on Sundays',
    app_version: 'dev',
  })
  expect(rows[0].user_agent).toMatch(/iPhone/)
})
