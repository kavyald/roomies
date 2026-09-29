// Shared setup for journeys: each test makes its own account and house (TESTING.md §4).
import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@playwright/test'
import { latestCode } from '../lib/testing/mailpit'
import { supabaseAuthGateway } from '../lib/adapters/supabase/auth-gateway'
import { adminClient, anonClient } from '../lib/adapters/supabase/server'
import { asOwner } from '../lib/testing/db'
import { mintJwt } from '../lib/testing/jwt'
import { APARTMENT_ROOMS } from '../lib/domain/rooms'

const API_URL = process.env.TEST_SUPABASE_URL ?? 'http://127.0.0.1:54321'

export const auth = supabaseAuthGateway(
  adminClient(API_URL, mintJwt({ role: 'service_role', aud: undefined })),
  anonClient(API_URL, mintJwt({ role: 'anon', aud: undefined })),
  () => {},
)

export const freshEmail = (tag: string) => `${tag}-${randomUUID().slice(0, 8)}@roomies.test`

/** A real account with a profile, admin of its own new house. */
export const anOwner = async (name = 'Kavya') => {
  const email = freshEmail('owner')
  const r = await auth.createUser(email)
  if (!r.ok) throw new Error(r.error)
  const userId = r.value
  const houseId = randomUUID()
  await asOwner(async (db) => {
    await db.query('insert into profiles (id, display_name) values ($1, $2)', [userId, name])
    await db.query('insert into houses (id, name, created_by, settings) values ($1, $2, $3, $4)', [
      houseId,
      'The apartment',
      userId,
      { timezone: 'America/New_York', feeling_weights: {}, invite_ttl_days: 7 },
    ])
    await db.query("insert into house_members (house_id, user_id, role) values ($1, $2, 'admin')", [
      houseId,
      userId,
    ])
    for (const [i, r] of APARTMENT_ROOMS.entries()) {
      await db.query(
        'insert into rooms (id, house_id, name, floor, kind, element, sort_order) values ($1, $2, $3, $4, $5, $6, $7)',
        [randomUUID(), houseId, r.name, r.floor, r.kind, r.element ?? null, i],
      )
    }
  })
  return { email, userId, houseId }
}

export const signIn = async (page: Page, email: string) => {
  await page.goto('/sign-in')
  await page.getByLabel('Your email').fill(email)
  await page.getByRole('button', { name: 'Send me a code' }).click()
  await page.getByLabel('6-digit code').fill(await latestCode(email))
}

export const dismissInstallGuide = async (page: Page) => {
  const guide = page.getByRole('dialog', { name: 'Add Roomies to your Home Screen' })
  await guide.getByRole('button', { name: 'Maybe later' }).click()
  await expect(guide).toBeHidden()
}

/** Signs in as a fresh owner and opens their House tab. */
export const ownerOnHouseTab = async (page: Page) => {
  const owner = await anOwner('Kavya')
  await signIn(page, owner.email)
  await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
  await dismissInstallGuide(page)
  await page.goto(`/h/${owner.houseId}/house`)
  return owner
}

/** + → tile → title → Add: three taps and a title. */
export const addWithThreeTaps = async (page: Page, tile: string, title: string) => {
  await page.getByRole('button', { name: 'Add', exact: true }).click() // 1
  await page
    .getByRole('dialog', { name: 'Add something' })
    .getByRole('button', { name: new RegExp(`^${tile}`) })
    .click() // 2
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('textbox').first().fill(title)
  await sheet.getByRole('button', { name: 'Add', exact: true }).click() // 3
  // The sheet closes once the house has it (added, or pointed at the one already there).
  await expect(sheet).toBeHidden()
}

/** Puts an item straight into the database (for states the UI can't make, like "9 days ago"). */
export const anItem = async (
  owner: { houseId: string; userId: string },
  o: {
    category: 'need' | 'chore' | 'task'
    title: string
    repeatDays?: number
    lastDoneDaysAgo?: number
  },
) => {
  const id = randomUUID()
  await asOwner((db) =>
    db.query(
      `insert into items (id, house_id, category, title, repeat_days, last_done_at, last_done_by, created_by)
       values ($1, $2, $3, $4, $5, now() - make_interval(days => $6::int), case when $6::int is null then null else $7::uuid end, $7)`,
      [
        id,
        owner.houseId,
        o.category,
        o.title,
        o.repeatDays ?? null,
        o.lastDoneDaysAgo ?? null,
        owner.userId,
      ],
    ),
  )
  return id
}
