import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { ownerOnHouseTab } from './support'

// axe at 375pt (the iPhone profile), light and dark.
const axeClean = async (page: Page, screen: string) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    // Let the theme's color transition finish, or axe reads one theme's text on the other's paper.
    await page.waitForTimeout(500)
    const { violations } = await new AxeBuilder({ page }).analyze()
    const bad = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(bad, `${screen} (${colorScheme})`).toEqual([])
  }
}

// T108: each tab ranks by priority. A feeling moves an item up in its own tab, only Urgent and
// Soon get a chip, a tab with something Urgent carries a dot, and Tasks has one add button.
test('a feeling moves a need up Needs; Urgent dots its tab; Tasks has one +', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  await asOwner(async (db) => {
    await db.query(
      `insert into items (id, house_id, category, title, priority, created_by, created_at)
       values ($1, $2, 'need', 'Paper towels', 'normal', $3, now() - interval '2 days'),
              ($4, $2, 'need', 'Dish soap', 'normal', $3, now() - interval '1 day'),
              ($5, $2, 'task', 'Leak under the sink', 'urgent', $3, now()),
              ($6, $2, 'task', 'Hang the mirror', 'normal', $3, now())`,
      [randomUUID(), owner.houseId, owner.userId, randomUUID(), randomUUID(), randomUUID()],
    )
  })
  await page.reload()
  const tabs = page.getByRole('navigation', { name: 'Tabs' })

  // The dot: Tasks has something Urgent; Needs doesn't (yet).
  await expect(tabs.getByRole('link', { name: 'Tasks, something urgent' })).toBeVisible()
  await expect(tabs.getByRole('link', { name: 'Needs', exact: true })).toBeVisible()

  // Needs: equal scores, newest first. Sharing 😰 on Paper towels moves it to the top, as Soon.
  await tabs.getByRole('link', { name: 'Needs' }).click()
  const rows = page.getByRole('list', { name: 'Needs' }).getByRole('listitem')
  await expect(rows.first()).toContainText('Dish soap')
  await expect(rows.nth(1)).toContainText('Paper towels')
  await expect(page.getByRole('list', { name: 'Needs' })).not.toContainText('Normal')
  await page.getByRole('button', { name: 'Share a feeling: Paper towels' }).click()
  await page.getByRole('button', { name: 'Anxious', exact: true }).click()
  await expect(rows.first()).toContainText('Paper towels')
  await expect(rows.first()).toContainText('Soon')
  await expect(rows.nth(1)).not.toContainText('Soon')
  await axeClean(page, 'Needs')

  // Tasks: the Urgent one first with its chip; no Normal chip; the done circle on the left; the +
  // is the only way to add.
  await tabs.getByRole('link', { name: /^Tasks/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible()
  const tasks = page.getByRole('list', { name: 'Tasks' })
  const leak = tasks.getByRole('button', { name: 'Leak under the sink', exact: true })
  await expect(tasks.getByRole('listitem').first()).toContainText('Leak under the sink')
  await expect(leak).toHaveAccessibleDescription(/Urgent/)
  await axeClean(page, 'Tasks')
  await expect(tasks).not.toContainText('Normal')
  const check = await tasks.getByRole('button', { name: 'Done: Leak under the sink' }).boundingBox()
  const card = await leak.boundingBox()
  expect(check!.x).toBeLessThan(card!.x)
  await expect(page.getByRole('main').getByRole('button', { name: /New|Add a task/ })).toHaveCount(
    0,
  )
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(1)

  // Requests start from the +: its "A request" tile opens New request or visit.
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'A poll or a run instead?' }).click()
  await page.getByRole('button', { name: /^A request/ }).click()
  await expect(page.getByRole('dialog', { name: 'New request or visit' })).toBeVisible()
})
