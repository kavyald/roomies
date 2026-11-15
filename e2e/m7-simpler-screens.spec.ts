// Q7: the M7 screens together, as T107 left them. Four tabs in order, House's layout (Polls,
// Calendar, Activity, then People, Chores, Money and Priority; no Notifications link), personal
// settings as two pages, an empty Tasks with no requests block, and no monthly total anywhere while
// costs still record (T64–T67, T82, T107).
import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { anItem, anOwner, dismissInstallGuide, signIn } from './support'

test('the M7 screens: tabs, House, You and Tasks, with no monthly total', async ({ page }) => {
  const owner = await anOwner('Kavya')
  const plumber = await anItem(owner, { category: 'task', title: 'Plumber comes' })
  await anItem(owner, { category: 'need', title: 'Dish soap' })
  await asOwner((db) =>
    db.query(`update items set when_at = now() + interval '1 day' where id = $1`, [plumber]),
  )
  await signIn(page, owner.email)
  const h = `/h/${owner.houseId}`
  await expect(page).toHaveURL(new RegExp(`${h}$`))
  await dismissInstallGuide(page)

  // Tabs: House, Needs, Tasks, Chores.
  const tabs = page.getByRole('navigation', { name: 'Tabs' }).getByRole('link')
  await expect(tabs).toHaveText(['House', 'Needs', 'Tasks', 'Chores'])

  // House is first and is where the app opens; the dated task counts on its Calendar row.
  await expect(page.getByRole('heading', { name: 'House', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Calendar/ })).toContainText('1 this week')

  // You: Notifications and Appearance, each its own page.
  await page.getByRole('link', { name: 'Your settings' }).click()
  await expect(page).toHaveURL(new RegExp(`${h}/me$`))
  await page.getByRole('link', { name: /^Appearance/ }).click()
  await expect(page).toHaveURL(new RegExp(`${h}/me/appearance$`))
  await page.goto(`${h}/me`)
  await page.getByRole('link', { name: /^Notifications/ }).click()
  await expect(page).toHaveURL(new RegExp(`${h}/me/notifications$`))

  // House (old /house and /admin links land there): Polls, then Calendar and Activity, then the
  // setup groups in order; no Notifications link and no Settings or History headings.
  await page.goto(`${h}/admin`)
  await expect(page).toHaveURL(new RegExp(`${h}$`))
  await expect(page.getByRole('link', { name: /Notifications/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /^(Settings|History)$/ })).toHaveCount(0)
  // The rows load after the heading; read the page once the last of them is there.
  await expect(page.getByRole('button', { name: /^How feelings raise priority/ })).toBeVisible()
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([
    'Polls',
    'People',
    'Chores',
    'Money',
    'Priority',
  ])
  const text = await page.locator('main').innerText()
  const at = (s: string) => text.indexOf(s)
  expect(at('Calendar')).toBeGreaterThan(-1)
  expect(at('Calendar')).toBeLessThan(at('Activity'))
  expect(at('Activity')).toBeLessThan(at('Roommates'))
  expect(at('Roommates')).toBeLessThan(at('Routines'))

  // Tasks with nothing open: the Requests & visits heading and its New, no empty-state block.
  await tabs.filter({ hasText: 'Tasks' }).click()
  await expect(page.getByRole('heading', { name: 'Requests & visits' })).toBeVisible()
  await expect(page.getByText(/No requests yet/)).toHaveCount(0)

  // A cost still records on a run's Finish, and no screen shows a monthly total.
  await tabs.filter({ hasText: 'Needs' }).click()
  await page.getByRole('button', { name: 'Start a run' }).click()
  await page
    .getByRole('dialog', { name: 'Start a run' })
    .getByRole('button', { name: /^Start run/ })
    .click()
  const run = page.getByRole('dialog').filter({ has: page.getByLabel('Spent (optional)') })
  await run.getByLabel('Spent (optional)').fill('12')
  await run.getByRole('button', { name: /^Finish/ }).click()
  await expect(run).toBeHidden()
  await expect
    .poll(async () =>
      asOwner(async (db) => {
        const r = await db.query('select amount_cents from costs where house_id = $1', [
          owner.houseId,
        ])
        return r.rows.map((row) => Number(row.amount_cents))
      }),
    )
    .toEqual([1200])
  for (const path of ['', '/needs', '/tasks', '/chores', '/activity', '/calendar', '/me']) {
    await page.goto(`${h}${path}`)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.getByText(/Spent this month|this month's total/i)).toHaveCount(0)
  }
})
