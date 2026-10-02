// Fewer taps (T43): swipe to finish or feel, one-tap feelings, and faster adding.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { anItem, ownerOnHouseTab } from './support'

/** A sideways drag with the mouse, starting inside the card on the side it moves away from. */
const swipe = async (page: Page, card: Locator, direction: 'right' | 'left') => {
  const box = (await card.boundingBox())!
  const y = box.y + box.height / 2
  const x = direction === 'right' ? box.x + 24 : box.x + box.width - 24
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(direction === 'right' ? x + 180 : x - 180, y + 4, { steps: 12 })
  await page.mouse.up()
}

test('a swipe right finishes a task or a chore, with Undo; a swipe left opens the emoji tray', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await anItem(owner, { category: 'task', title: 'Fix the latch' })
  await anItem(owner, { category: 'chore', title: 'Take out the trash', repeatDays: 7 })

  // Tasks: right = Done.
  await page.goto(`/h/${owner.houseId}/tasks`)
  const tasks = page.getByRole('list', { name: 'Tasks' })
  const latch = tasks.getByRole('button', { name: 'Fix the latch', exact: true })
  await swipe(page, latch, 'right')
  const done = page.getByRole('status').filter({ hasText: 'Done. 💛' })
  await expect(done).toBeVisible()
  await expect(latch).toBeHidden()
  await expect(page.getByRole('dialog')).toHaveCount(0) // the drag wasn't a tap
  await done.getByRole('button', { name: 'Undo' }).click()
  await expect(latch).toBeVisible()

  // Left = the emoji tray; one tap shares.
  await swipe(page, latch, 'left')
  const tray = tasks.getByRole('group', { name: 'How do you feel about this?' })
  await expect(tray).toBeVisible()
  await tray.getByRole('button', { name: 'Confused' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Shared. The house can see how you feel.' }),
  ).toBeVisible()
  await expect(tasks.getByRole('listitem').filter({ hasText: 'Fix the latch' })).toContainText(
    '😕1',
  )

  // Chores: right = Did it, with Undo.
  await page.goto(`/h/${owner.houseId}/chores`)
  const trash = page
    .getByRole('list', { name: 'Chores' })
    .getByRole('button', { name: 'Take out the trash', exact: true })
  await swipe(page, trash, 'right')
  const did = page.getByRole('status').filter({ hasText: 'Did it. Thanks!' })
  await expect(did).toBeVisible()
  const card = page.getByRole('list', { name: 'Chores' }).getByRole('listitem')
  await expect(card).toContainText('Last done today · Kavya')
  await did.getByRole('button', { name: 'Undo' }).click()
  await expect(card).toContainText('Not done yet')
})

test('Needs rows swipe too, and a feeling takes two taps from a card', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  await anItem(owner, { category: 'need', title: 'Olive oil' })
  await anItem(owner, { category: 'task', title: 'Bleed the radiators' })

  await page.goto(`/h/${owner.houseId}/needs`)
  const needs = page.getByRole('list', { name: 'Needs' })
  await swipe(page, needs.getByRole('button', { name: 'Olive oil', exact: true }), 'right')
  const got = page.getByRole('status').filter({ hasText: 'Got Olive oil.' })
  await expect(got).toBeVisible()
  await got.getByRole('button', { name: 'Undo' }).click()
  await expect(needs).toContainText('Olive oil')

  // Home: 🙂+ then 😰 (two taps). Tapping it again takes it back.
  await page.getByRole('link', { name: 'Home' }).click()
  const feed = page.getByRole('list', { name: 'Needs attention' })
  const feel = feed.getByRole('button', { name: 'Share a feeling: Bleed the radiators' })
  await feel.click() // 1
  await feed.getByRole('button', { name: 'Anxious' }).click() // 2
  const row = feed.getByRole('listitem').filter({ hasText: 'Bleed the radiators' })
  await expect(row).toContainText('😰1')
  await feel.click()
  await expect(feed.getByRole('button', { name: 'Anxious' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await feed.getByRole('button', { name: 'Anxious' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Removed your feeling.' })).toBeVisible()
  await expect(row).not.toContainText('😰1')
})

test('+ on Needs adds three in one sheet; + on Chores makes a repeating chore in 3 taps', async ({
  page,
}) => {
  const owner = await ownerOnHouseTab(page)
  await page.goto(`/h/${owner.houseId}/needs`)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'A need' })
  const title = sheet.getByLabel('What do we need?')
  for (const t of ['Lemons', 'Rice']) {
    await title.fill(t)
    await sheet.getByRole('button', { name: 'Add another' }).click()
    await expect(title).toHaveValue('')
    await expect(title).toBeFocused()
  }
  await title.fill('Foil')
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet).toBeHidden()
  const needs = page.getByRole('list', { name: 'Needs' })
  for (const t of ['Lemons', 'Rice', 'Foil']) await expect(needs).toContainText(t)

  await page.goto(`/h/${owner.houseId}/chores`)
  await page.getByRole('button', { name: 'Add', exact: true }).click() // 1
  const chore = page.getByRole('dialog', { name: 'A chore' })
  await chore.getByLabel('What needs doing?').fill('Water the plants')
  await chore.getByRole('button', { name: 'About every…' }).click() // 2
  await chore.getByLabel('Days between').fill('3')
  await chore.getByRole('button', { name: 'Add', exact: true }).click() // 3
  await expect(chore).toBeHidden()
  await expect(page.getByRole('list', { name: 'Chores' })).toContainText('About every 3 days')
})
