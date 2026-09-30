// Q2: the M2 journey end to end — needs, chores, feelings on Home, and the feeling weights.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { aRoommate, anItem, ownerOnHouseTab } from './support'

test('a duplicate need points to the first, Did it resets a chore, 😰 moves a task up Home, and a weight re-ranks it', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  const sam = await aRoommate(owner, 'Sam')
  await anItem(owner, {
    category: 'chore',
    title: 'Take out the trash',
    repeatDays: 7,
    lastDoneDaysAgo: 9,
  })
  // Home: a High task (45) above a Normal one Sam is frustrated about (25 + 😤 15 = 40).
  const latch = randomUUID()
  await asOwner(async (db) => {
    await db.query(
      `insert into items (id, house_id, category, title, priority, created_by)
       values ($1, $2, 'task', 'Replace hallway bulb', 'high', $3), ($4, $2, 'task', 'Fix the latch', 'normal', $3)`,
      [randomUUID(), owner.houseId, owner.userId, latch],
    )
    await db.query(
      `insert into feelings (item_id, user_id, house_id, kind) values ($1, $2, $3, 'frustrated')`,
      [latch, sam.userId, owner.houseId],
    )
  })

  // 1. A duplicate need points to the first.
  await page.goto(`/h/${owner.houseId}/needs`)
  const weNeed = page.getByLabel('We need…')
  await weNeed.fill('Tomatoes')
  await weNeed.press('Enter')
  const needs = page.getByRole('list', { name: 'Needs' })
  await expect(needs).toContainText('Tomatoes')
  await weNeed.fill('  tomatoes ')
  await weNeed.press('Enter')
  await expect(
    page.getByRole('status').filter({ hasText: "That's already on the list." }),
  ).toBeVisible()
  await expect(needs.getByRole('listitem')).toHaveCount(1)

  // 2. Did it on a chore.
  await page.getByRole('link', { name: 'Chores' }).click()
  await page.getByRole('button', { name: 'Did it: Take out the trash' }).click()
  await expect(page.getByRole('list', { name: 'Chores' })).toContainText('Last done today · Kavya')

  // 3. On Home, sharing 😰 moves the latch above the bulb (25 + 15 + 20 = 60).
  await page.getByRole('link', { name: 'Home' }).click()
  const feed = page.getByRole('list', { name: 'Needs attention' }).getByRole('listitem')
  await expect(feed.first()).toContainText('Replace hallway bulb')
  await expect(feed.nth(1)).toContainText('Fix the latch')
  await expect(page.getByRole('list', { name: 'Needs attention' })).not.toContainText(
    'Take out the trash', // just done, so it's not past its rhythm
  )
  await feed.nth(1).getByRole('button', { name: 'Fix the latch', exact: true }).click()
  const detail = page.getByRole('dialog', { name: 'Fix the latch' })
  await detail.getByRole('button', { name: '🙂+ Share a feeling' }).click()
  await detail.getByRole('radio', { name: /Anxious/ }).click()
  await detail.getByRole('button', { name: 'Share with the house' }).click()
  await expect(detail.getByRole('region', { name: 'How the house feels' })).toContainText(
    'You · 😰 Anxious',
  )
  await page.keyboard.press('Escape')
  await expect(feed.first()).toContainText('Fix the latch')
  await expect(feed.first()).toContainText('High')

  // 4. Turning 😰 down to −20 re-ranks it below the bulb again (25 + 15 − 20 = 20).
  await page.getByRole('link', { name: 'House' }).click()
  await page.getByRole('button', { name: /^Feeling weights/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Feeling weights' })
  const lower = sheet.getByRole('button', { name: 'Lower Anxious' })
  while (await lower.isEnabled()) await lower.click()
  await expect(sheet.getByRole('status', { name: 'Anxious weight' })).toHaveText('−20')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(feed.first()).toContainText('Replace hallway bulb')
  await expect(feed.nth(1)).toContainText('Fix the latch')
  await expect(feed.nth(1)).toContainText('Normal')
  await expect(page.getByRole('complementary', { name: 'Feeling weights changed' })).toContainText(
    'You set 😰 Anxious to −20',
  )
})
