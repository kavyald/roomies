// T55: take back a vote, change or clear the deadline, and reopen a closed poll.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { aRoommate, anOwner, dismissInstallGuide, signIn } from './support'

/** The house's day `days` from now, as a date input wants it. */
const dayFromNow = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  })

test('take back a vote, move and clear the deadline, close and reopen', async ({ page }) => {
  const owner = await anOwner('Kavya')
  const sam = await aRoommate(owner, 'Sam')
  const [poll, nest, burrow] = [randomUUID(), randomUUID(), randomUUID()]
  await asOwner(async (db) => {
    await db.query(
      `insert into polls (id, house_id, question, closes_at, created_by)
       values ($1, $2, 'House name?', now() + interval '2 days', $3)`,
      [poll, owner.houseId, owner.userId],
    )
    await db.query(
      `insert into poll_options (id, poll_id, house_id, label, added_by, sort_order)
       values ($1, $3, $4, 'The Nest', $5, 0), ($2, $3, $4, 'Burrow', $5, 1)`,
      [nest, burrow, poll, owner.houseId, owner.userId],
    )
    await db.query(
      'insert into poll_votes (poll_id, user_id, house_id, option_id) values ($1, $2, $3, $4)',
      [poll, sam.userId, owner.houseId, burrow],
    )
  })
  await signIn(page, owner.email)
  await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
  await dismissInstallGuide(page)

  await page
    .getByRole('region', { name: 'Open polls' })
    .getByRole('button', { name: /^House name\?/ })
    .click()
  const sheet = page.getByRole('dialog', { name: 'House name?' })
  const theNest = sheet.getByRole('radio', { name: /The Nest/ })

  // Vote, then tap the same pick again to take it back.
  await theNest.click()
  await expect(theNest).toHaveAttribute('aria-checked', 'true')
  await expect(sheet).toContainText('2 of 2 voted')
  await expect(sheet).toContainText('Tap your pick again to take your vote back.')
  await theNest.click()
  await expect(theNest).toHaveAttribute('aria-checked', 'false')
  await expect(sheet).toContainText('1 of 2 voted')
  await expect(page.getByText('Vote taken back.')).toBeVisible()

  // Move the deadline, then take it off.
  await sheet.getByRole('button', { name: 'Change the deadline' }).click()
  await sheet.getByLabel('Closes', { exact: true }).fill(dayFromNow(5))
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByRole('button', { name: 'Change the deadline' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Change the deadline' }).click()
  await sheet.getByRole('button', { name: 'No deadline' }).click()
  await expect(sheet).toContainText('No deadline')
  await expect(sheet.getByRole('button', { name: 'Add a deadline' })).toBeVisible()

  // Close it (Burrow wins), reopen it, and the votes can change again.
  await sheet.getByRole('button', { name: 'Close poll' }).click()
  await expect(sheet.getByRole('status')).toHaveText('Burrow wins (1–0)')
  await expect(theNest).toBeDisabled()
  await sheet.getByRole('button', { name: 'Reopen poll' }).click()
  await expect(sheet.getByRole('button', { name: 'Close poll' })).toBeVisible()
  await expect(sheet.getByRole('status')).toBeHidden()
  await theNest.click()
  await expect(sheet).toContainText('2 of 2 voted')
  await page.keyboard.press('Escape')

  // Activity shows the reopen and both deadline changes; the withdrawn vote stays hidden.
  await page.goto(`/h/${owner.houseId}/activity`)
  await expect(page.getByRole('heading', { name: 'Today', level: 2 })).toBeVisible()
  for (const line of [
    /Kavya reopened “House name\?”/,
    /Kavya took the deadline off “House name\?”/,
    /Kavya changed when “House name\?” closes/,
  ])
    await expect(page.getByRole('button', { name: line })).toBeVisible()
  await expect(page.getByText(/withdr|took back/i)).toHaveCount(0)
  // A line opens the poll in place.
  await page.getByRole('button', { name: /Kavya reopened “House name\?”/ }).click()
  await expect(page.getByRole('dialog', { name: 'House name?' })).toBeVisible()
})
