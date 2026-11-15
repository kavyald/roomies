// Q2: the M2 journey end to end — needs, chores, feelings and priority, and the feeling weights.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { aRoommate, anItem, ownerOnHouseTab } from './support'

test('a duplicate need points to the first, Did it resets a chore, 😰 raises a task to High, and a weight brings it back', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  const sam = await aRoommate(owner, 'Sam')
  await anItem(owner, {
    category: 'chore',
    title: 'Take out the trash',
    lastDoneDaysAgo: 9,
  })
  // A High task (45) and a Normal one Sam is frustrated about (25 + 😤 15 = 40).
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

  // 2. Took care of a chore: its last done resets.
  await page.getByRole('link', { name: 'Chores' }).click()
  await page.getByRole('button', { name: 'Share a feeling: Take out the trash' }).click()
  await page.getByRole('button', { name: 'See details' }).click()
  const chore = page.getByRole('dialog', { name: 'Take out the trash' })
  await chore.getByRole('button', { name: 'Took care of it', exact: true }).click()
  await expect(chore).toContainText('Just now · Kavya')
  await page.keyboard.press('Escape')
  await expect(chore).toBeHidden()

  // 3. On Tasks, the latch's "Why is this here?" adds up its score; sharing 😰 raises it to High
  // (25 + 15 + 20 = 60). Home and its ranked feed are gone (T107): the score lives on the item.
  await page.getByRole('link', { name: 'Tasks' }).click()
  await page.getByRole('button', { name: 'Fix the latch', exact: true }).click()
  const detail = page.getByRole('dialog', { name: 'Fix the latch' })
  const why = detail.getByRole('region', { name: 'Why is this here?' })
  await why.getByRole('button', { name: /Why is this here\?/ }).click()
  await expect(why).toContainText('Normal priority+25')
  await expect(why).toContainText('😤 Sam+15')
  await expect(why).toContainText('Score40')
  await detail.getByRole('button', { name: '🙂+ Share a feeling' }).click()
  await detail.getByRole('button', { name: 'Anxious', exact: true }).click()
  await expect(detail.getByRole('region', { name: 'How the house feels' })).toContainText(
    'You · 😰 Anxious',
  )
  await expect(why).toContainText('Score60')
  await expect(why).toContainText('High')
  await page.keyboard.press('Escape')

  // 4. Turning 😰 down to −20 (House → Priority) brings it back to Normal (25 + 15 − 20 = 20).
  await page.getByRole('navigation', { name: 'Tabs' }).getByRole('link', { name: 'House' }).click()
  await page.getByRole('button', { name: /^How feelings raise priority/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Feeling weights' })
  const lower = sheet.getByRole('button', { name: 'Lower Anxious' })
  while (await lower.isEnabled()) await lower.click()
  await expect(sheet.getByRole('status', { name: 'Anxious weight' })).toHaveText('−20')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('complementary', { name: 'Feeling weights changed' })).toContainText(
    'You set 😰 Anxious to −20',
  )
  await page.getByRole('link', { name: 'Tasks' }).click()
  await page.getByRole('button', { name: 'Fix the latch', exact: true }).click()
  await why.getByRole('button', { name: /Why is this here\?/ }).click()
  await expect(why).toContainText('Score20')
  await expect(why).toContainText('Normal')
})
