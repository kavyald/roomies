import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { ownerOnHouseTab } from './support'

test('Landlord list → sent → 2 tasks to a new visit and 1 back to the pool; the request closes and history shows the path', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  const landlord = randomUUID()
  await asOwner(async (db) => {
    await db.query(
      `insert into contacts (id, house_id, name, phone) values ($1, $2, 'Landlord', '555-0100')`,
      [landlord, owner.houseId],
    )
    for (const title of ['Leak under the sink', 'Mold in the bathroom', 'Window latch']) {
      await db.query(
        `insert into items (id, house_id, category, title, contact_id, created_by)
         values ($1, $2, 'task', $3, $4, $5)`,
        [randomUUID(), owner.houseId, title, landlord, owner.userId],
      )
    }
  })

  await page.goto(`/h/${owner.houseId}/tasks`)
  const section = page.getByRole('region', { name: 'Requests & visits' })
  await expect(section).toContainText('No requests yet.')

  // "Add to Landlord list" on each task.
  for (const title of ['Leak under the sink', 'Mold in the bathroom', 'Window latch']) {
    await page
      .getByRole('list', { name: 'Tasks' })
      .getByRole('button', { name: title, exact: true })
      .click()
    const detail = page.getByRole('dialog', { name: title })
    await detail.getByRole('button', { name: 'Add to Landlord list' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Added to the Landlord list.' }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(detail).toBeHidden()
  }
  await expect(section).toContainText('Landlord request')
  await expect(section).toContainText('not sent yet · 3 tasks')

  // Send it: copy the message yourself, then mark it sent.
  await section.getByRole('button', { name: /^Landlord request/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Landlord request' })
  await sheet.getByRole('button', { name: 'Send request' }).click()
  await expect(sheet.getByLabel('The message')).toHaveValue(/1\. Leak under the sink/)
  await sheet.getByLabel('Sent by').selectOption('text')
  await sheet.getByRole('button', { name: 'Mark as sent' }).click()
  await expect(sheet).toContainText('Sent today by text')

  // Their reply: the leak and the mold go to a new visit, the latch back to the pool.
  const rows = sheet.getByRole('list', { name: 'On this run' })
  await rows.getByRole('checkbox', { name: 'Leak under the sink' }).check()
  await rows.getByRole('checkbox', { name: 'Mold in the bathroom' }).check()
  await sheet.getByRole('button', { name: 'Move to a visit…' }).click()
  await sheet.getByLabel(/Move these 2 to/).selectOption({ label: 'A new Landlord visit' })
  await sheet.getByLabel('Date (optional)').fill('2026-10-01')
  await sheet.getByLabel('Note').fill('Sending a plumber Thu')
  await sheet.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(rows).toContainText('Moved → Landlord visit · Sending a plumber Thu')

  await rows.getByRole('checkbox', { name: 'Window latch' }).check()
  await sheet.getByRole('button', { name: 'Back to the pool…' }).click()
  await sheet.getByLabel('Note').fill("That one's on us")
  await sheet.getByRole('button', { name: 'Put back' }).click()
  await expect(rows).toContainText("Back in the pool · That one's on us")
  await expect(sheet).toContainText('All sorted')
  await page.keyboard.press('Escape')

  // The request closed itself; the visit is there.
  await expect(section).not.toContainText('Landlord request')
  await expect(section).toContainText('Landlord visit')
  await expect(section).toContainText('2 to look at')

  // Each task keeps its path.
  const tasks = page.getByRole('list', { name: 'Tasks' })
  await tasks.getByRole('button', { name: 'Window latch', exact: true }).click()
  let detail = page.getByRole('dialog', { name: 'Window latch' })
  await detail.getByRole('button', { name: 'History' }).click()
  await expect(detail.getByRole('region', { name: 'Run history' })).toContainText(
    "Back in the pool from Landlord request · That one's on us",
  )
  await expect(detail).toContainText('One of us')
  await page.keyboard.press('Escape')
  await expect(detail).toBeHidden()
  await tasks.getByRole('button', { name: 'Leak under the sink', exact: true }).click()
  detail = page.getByRole('dialog', { name: 'Leak under the sink' })
  const history = detail.getByRole('region', { name: 'Run history' })
  await history.getByRole('button', { name: 'History' }).click()
  await expect(history).toContainText('Added to Landlord request')
  await expect(history).toContainText('Moved to Landlord visit · Sending a plumber Thu')

  // "Handled by" follows the visit (T51): the picker says so and opens the visit instead.
  await detail.getByRole('button', { name: 'Change', exact: true }).click()
  const picker = detail.getByRole('region', { name: "Who's handling it?" })
  await expect(picker).toContainText(
    "It's on the Landlord visit. Move it to change who's handling it.",
  )
  await expect(picker.getByRole('radiogroup')).toHaveCount(0)
  await picker.getByRole('button', { name: 'Open the Landlord visit' }).click()
  await expect(page.getByRole('dialog', { name: 'Landlord visit' })).toBeVisible()
})
