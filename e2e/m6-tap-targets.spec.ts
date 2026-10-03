// M6 exit criteria (PRD §12, Q6): every action hits its tap target, and item views fit at 375pt
// without scrolling. Swipes, the 🙂+ two-tap feeling and the three-tap repeating chore are in
// m6-fewer-taps; the personal need (title + Me) is in m6-personal-needs.
import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { anItem, dismissInstallGuide, ownerOnHouseTab, signIn, anOwner } from './support'

/** Counts the taps a journey takes. */
const tapper = () => {
  let taps = 0
  return {
    tap: async (target: Locator) => {
      await target.click()
      taps += 1
    },
    check: async (target: Locator) => {
      await target.check()
      taps += 1
    },
    get count() {
      return taps
    },
    reset() {
      taps = 0
    },
  }
}

test('finishing takes one tap without swiping, and a grocery run about six', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  await anItem(owner, { category: 'task', title: 'Fix the latch' })
  await anItem(owner, { category: 'chore', title: 'Take out the trash', repeatDays: 7 })
  await anItem(owner, { category: 'need', title: 'Foil' })
  const t = tapper()
  const h = `/h/${owner.houseId}`

  // The check circle is the button beside each swipe (FRONTEND §5.1): one tap, with Undo.
  await page.goto(`${h}/tasks`)
  await t.tap(page.getByRole('button', { name: 'Done: Fix the latch' }))
  await expect(page.getByRole('status').filter({ hasText: 'Done. 💛' })).toBeVisible()
  await page.goto(`${h}/chores`)
  await t.tap(page.getByRole('button', { name: 'Did it: Take out the trash' }))
  await expect(page.getByRole('status').filter({ hasText: 'Did it. Thanks!' })).toBeVisible()
  await page.goto(`${h}/needs`)
  await t.tap(page.getByRole('button', { name: 'Got it: Foil' }))
  await expect(page.getByRole('status').filter({ hasText: 'Got Foil.' })).toBeVisible()
  expect(t.count).toBe(3) // one each

  // A feeling from a Needs row without swiping: 🙂+, then the emoji.
  await anItem(owner, { category: 'need', title: 'Olive oil' })
  await page.goto(`${h}/needs`)
  const needs = page.getByRole('list', { name: 'Needs' })
  t.reset()
  await t.tap(needs.getByRole('button', { name: 'Share a feeling: Olive oil' }))
  await t.tap(needs.getByRole('button', { name: 'Anxious' }))
  await expect(needs.getByRole('listitem').filter({ hasText: 'Olive oil' })).toContainText('😰')
  expect(t.count).toBe(2)

  // A grocery run: start, get 3 things, finish with $40 (PRD §6.3: about 6 taps).
  await anItem(owner, { category: 'need', title: 'Milk' })
  await anItem(owner, { category: 'need', title: 'Eggs' })
  await page.reload()
  t.reset()
  await t.tap(page.getByRole('button', { name: 'Start a run' }))
  const start = page.getByRole('dialog', { name: 'Start a run' })
  await expect(start.getByRole('checkbox', { name: 'Milk', exact: true })).toBeChecked()
  await t.tap(start.getByRole('button', { name: /^Start run/ }))
  const run = page.getByRole('dialog', { name: "Kavya's run" })
  const rows = run.getByRole('list', { name: 'On this run' })
  for (const thing of ['Olive oil', 'Milk', 'Eggs']) {
    await t.check(rows.getByRole('checkbox', { name: thing, exact: true }))
  }
  await expect(run).toContainText('3 of 3 done')
  await run.getByLabel('Spent (optional)').fill('40')
  await t.tap(run.getByRole('button', { name: 'Finish' }))
  await expect(
    page.getByRole('status').filter({ hasText: 'Finished. $40.00 noted.' }),
  ).toBeVisible()
  expect(t.count).toBe(6)
  await expect(needs.getByRole('listitem')).toHaveCount(0)
  await page.goto(`${h}/house`)
  await expect(page.getByLabel('Spent this month')).toContainText('$40.00')
})

/** Fills in every meta row an item can show, so each sheet is at its tallest. */
const fillIn = async (
  owner: { houseId: string; userId: string },
  id: string,
  more = '',
  when = true,
) => {
  await asOwner((db) =>
    db.query(
      `update items set note = 'The tall one by the door',
         room_id = (select id from rooms where house_id = $2 order by sort_order limit 1),
         when_at = ${when ? "now() + interval '2 days'" : 'null'}${more} where id = $1`,
      [id, owner.houseId],
    ),
  )
}

const fitsWithoutScrolling = async (page: Page, title: string, primary: string) => {
  const sheet = page.getByRole('dialog', { name: title })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('heading', { name: title })).toBeInViewport({ ratio: 1 })
  await expect(sheet.getByRole('button', { name: primary, exact: true })).toBeInViewport({
    ratio: 1,
  })
  const meta = sheet.locator('dl')
  await expect(meta.locator('dd').last()).toBeInViewport({ ratio: 1 })
  await expect(meta).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
}

/** No sideways scrolling, and no critical or serious axe issues (as in m4-a11y). */
const fitsSideways = async (page: Page, screen: string) => {
  await expect(page).toHaveTitle(/Roomies/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  const { violations } = await new AxeBuilder({ page }).analyze()
  const bad = violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${screen}: ${v.id} (${v.impact}) × ${v.nodes.length}: ${v.nodes[0]?.target}`)
  expect(bad, bad.join('\n')).toEqual([])
}

test.describe('at 375pt', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`item views fit without scrolling; rooms and notification settings fit too (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme })
      const owner = await anOwner('Kavya')
      const contact = randomUUID()
      await asOwner((db) =>
        db.query(
          `insert into contacts (id, house_id, name, phone) values ($1, $2, 'Super', '(555) 010-2231')`,
          [contact, owner.houseId],
        ),
      )
      const need = await anItem(owner, { category: 'need', title: 'Paper towels' })
      await fillIn(owner, need, `, for_member = '${owner.userId}'`)
      const chore = await anItem(owner, {
        category: 'chore',
        title: 'Clean the fridge',
        repeatDays: 7,
        lastDoneDaysAgo: 9,
      })
      await fillIn(owner, chore, `, assignee_id = '${owner.userId}'`, false)
      const task = await anItem(owner, { category: 'task', title: 'Fix the radiator valve' })
      await fillIn(owner, task, `, assignee_id = '${owner.userId}', contact_id = '${contact}'`)

      await signIn(page, owner.email)
      await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
      await dismissInstallGuide(page)
      const h = `/h/${owner.houseId}`
      for (const [id, title, primary] of [
        [need, 'Paper towels', 'Got it'],
        [chore, 'Clean the fridge', 'Did it'],
        [task, 'Fix the radiator valve', 'Done'],
      ] as const) {
        await page.goto(`${h}/i/${id}`)
        await fitsWithoutScrolling(page, title, primary)
        await expect(page).toHaveURL(new RegExp(`${h}$`))
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog', { name: title })).toBeHidden()
      }

      // The rooms grid (T60) and notification settings (T61): nothing runs off the side, and axe.
      await page.goto(`${h}/house`)
      for (const group of ['Bedrooms', 'Bathrooms', 'Spaces']) {
        const grid = page.getByRole('list', { name: group })
        await expect(grid).toBeVisible()
        for (const room of await grid.getByRole('button').all()) {
          const box = (await room.boundingBox())!
          expect(box.x + box.width).toBeLessThanOrEqual(375)
          expect(box.height).toBeGreaterThanOrEqual(44)
        }
      }
      await fitsSideways(page, 'house')
      await page.goto(`${h}/me`)
      await expect(page.getByRole('group', { name: 'Tell me when' })).toBeVisible()
      await expect(page.getByRole('switch', { name: 'Quiet hours' })).toBeInViewport()
      await fitsSideways(page, 'me')
    })
  }
})
