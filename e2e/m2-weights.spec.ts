import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { aRoommate, anOwner, dismissInstallGuide, signIn } from './support'

test('a roommate who is not an admin sets 😰 to +40, and the feed re-ranks for everyone', async ({
  browser,
}) => {
  const owner = await anOwner('Kavya')
  const sam = await aRoommate(owner, 'Sam')
  // Two items tied at 45: a High-priority task (newer, so it wins the tie) and a need Sam is
  // anxious about (Normal 25 + 😰 20).
  const paper = randomUUID()
  await asOwner(async (db) => {
    await db.query(
      `insert into items (id, house_id, category, title, created_by, created_at)
       values ($1, $2, 'need', 'Toilet paper', $3, now() - interval '1 hour')`,
      [paper, owner.houseId, owner.userId],
    )
    await db.query(
      `insert into items (id, house_id, category, title, priority, created_by)
       values ($1, $2, 'task', 'Replace hallway bulb', 'high', $3)`,
      [randomUUID(), owner.houseId, owner.userId],
    )
    await db.query(
      `insert into feelings (item_id, user_id, house_id, kind) values ($1, $2, $3, 'anxious')`,
      [paper, sam.userId, owner.houseId],
    )
  })

  const open = async (email: string) => {
    const page = await (await browser.newContext()).newPage()
    await signIn(page, email)
    await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
    await dismissInstallGuide(page)
    return page
  }
  const kavya = await open(owner.email)
  const feed = kavya.getByRole('list', { name: 'Needs attention' }).getByRole('listitem')
  await expect(feed.first()).toContainText('Replace hallway bulb')
  await expect(feed.nth(1)).toContainText('Toilet paper')

  // Sam (a member, not an admin) changes the weights on the House tab.
  const samPage = await open(sam.email)
  await samPage.goto(`/h/${owner.houseId}/house`)
  await samPage.getByRole('button', { name: /^Feeling weights/ }).click()
  const sheet = samPage.getByRole('dialog', { name: 'Feeling weights' })
  await expect(sheet.getByRole('status', { name: 'Anxious weight' })).toHaveText('+20')
  for (let i = 0; i < 4; i++) await sheet.getByRole('button', { name: 'Raise Anxious' }).click()
  await expect(sheet.getByRole('status', { name: 'Anxious weight' })).toHaveText('+40')
  await expect(sheet.getByRole('button', { name: 'Raise Anxious' })).toBeDisabled()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(
    samPage.getByRole('status').filter({ hasText: 'The feed is re-ranked for everyone.' }),
  ).toBeVisible()

  // Kavya's feed re-ranks live (no reload), with a card saying why.
  await expect(feed.first()).toContainText('Toilet paper')
  await expect(feed.first()).toContainText('High') // Normal 25 + 😰 40 = 65
  await expect(kavya.getByRole('complementary', { name: 'Feeling weights changed' })).toContainText(
    'Sam set 😰 Anxious to +40',
  )
})
