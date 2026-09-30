import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { asOwner } from '../lib/testing/db'
import { ownerOnHouseTab } from './support'

const TZ = 'America/New_York'
// A date n days from today on the house's calendar, as YYYY-MM-DD.
const day = (n: number) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
// "Friday, October 2", the way the calendar names a day.
const dayName = (ymd: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${ymd}T12:00:00Z`))

test('dated items and runs show on the right days, and tapping one opens it', async ({ page }) => {
  const owner = await ownerOnHouseTab(page)
  await asOwner(async (db) => {
    const at = (ymd: string, time?: string) =>
      db.query(`select ($1::timestamp at time zone $2) as t`, [`${ymd} ${time ?? '00:00'}`, TZ])
    const insertItem = async (category: string, title: string, ymd: string, time?: string) =>
      db.query(
        `insert into items (id, house_id, category, title, when_at, when_has_time, created_by)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          owner.houseId,
          category,
          title,
          (await at(ymd, time)).rows[0].t,
          !!time,
          owner.userId,
        ],
      )
    await insertItem('task', 'Plumber comes', day(1), '10:00')
    await insertItem('need', 'Paper towels', day(3))
    await insertItem('task', 'Renew the lease', day(40))
    await db.query(
      `insert into runs (id, house_id, kind, title, runner_id, when_at, status, created_by)
       values ($1, $2, 'batch', 'Groceries', $3, $4, 'open', $3)`,
      [randomUUID(), owner.houseId, owner.userId, (await at(day(2))).rows[0].t],
    )
  })

  // Home: the next 7 days, in order; tapping one opens it.
  await page.goto(`/h/${owner.houseId}`)
  const coming = page.getByRole('list', { name: 'Coming up' }).getByRole('listitem')
  await expect(coming).toHaveCount(3)
  await expect(coming.nth(0)).toContainText('Plumber comes')
  await expect(coming.nth(0)).toContainText('Tomorrow 10:00')
  await expect(coming.nth(1)).toContainText('Groceries')
  await expect(coming.nth(2)).toContainText('Paper towels')
  await coming.nth(0).getByRole('button').click()
  await expect(page.getByRole('dialog', { name: 'Plumber comes' })).toBeVisible()
  await page.keyboard.press('Escape')

  // The month calendar: pick the run's day, open it.
  await page.getByRole('link', { name: 'All' }).click()
  await expect(page).toHaveURL(/\/calendar$/)
  const pick = async (ymd: string) => {
    for (let i = 0; i < 3; i++) {
      const button = page.getByRole('button', { name: new RegExp(`^${dayName(ymd)}(,|$)`) })
      if (await button.count()) return button.click()
      await page.getByRole('button', { name: 'Next month' }).click()
    }
    throw new Error(`no ${ymd} on the calendar`)
  }
  await pick(day(2))
  await expect(
    page.getByRole('button', { name: new RegExp(`^${dayName(day(2))}, 1 thing`) }),
  ).toHaveAttribute('aria-pressed', 'true')
  const list = page.getByRole('list', { name: 'On this day' })
  await expect(list).toContainText('Groceries')
  await list.getByRole('button', { name: /^Groceries/ }).click()
  await expect(page.getByRole('dialog', { name: 'Groceries' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Further out: the lease, a month or so ahead.
  await pick(day(40))
  await expect(list).toContainText('Renew the lease')
  await expect(list).toContainText('Any time')
})
