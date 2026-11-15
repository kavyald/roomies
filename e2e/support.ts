// Shared setup for journeys: each test makes its own account and house (TESTING.md §4).
import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@playwright/test'
import { latestCode } from '../lib/testing/mailpit'
import { supabaseAuthGateway } from '../lib/adapters/supabase/auth-gateway'
import { adminClient, anonClient } from '../lib/adapters/supabase/server'
import { cryptoTokens } from '../lib/adapters/tokens'
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

/**
 * An installed iPhone with push available and off (T95), stubbed in an init script since
 * Playwright can't reach a real push service. The subscription and permission are kept in
 * sessionStorage across page loads, like a real one. `denied` is a device that blocked Roomies;
 * `granted` one that allows it but isn't connected to anyone yet.
 */
export const stubInstalledIphonePush = (
  page: Page,
  permission: 'default' | 'denied' | 'granted' = 'default',
) =>
  page.addInitScript((permission) => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    const KEY = 'e2e.push'
    const endpoint =
      sessionStorage.getItem(KEY) ??
      'https://push.example.test/e2e-' + Math.random().toString(36).slice(2)
    const sub = {
      endpoint,
      toJSON() {
        return { endpoint: this.endpoint, keys: { p256dh: 'BKey', auth: 'auth' } }
      },
    }
    const subscribed = () => sessionStorage.getItem(KEY) !== null
    const pushManager = {
      getSubscription: async () => (subscribed() ? sub : null),
      subscribe: async () => (sessionStorage.setItem(KEY, endpoint), sub),
    }
    const reg = { pushManager }
    // `register` too, or the app's service worker setup breaks the page.
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: async () => reg,
        getRegistrations: async () => [reg],
        register: async () => reg,
        ready: Promise.resolve(reg),
        controller: null,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      configurable: true,
    })
    ;(window as unknown as { PushManager: unknown }).PushManager = function PushManager() {}
    ;(window as unknown as { Notification: unknown }).Notification = {
      get permission() {
        return subscribed() ? 'granted' : permission
      },
      requestPermission: async () => 'granted',
    }
  }, permission)

/** An invite link to the owner's house, straight into the database (T110's join journeys). */
export const anInviteLink = async (owner: { houseId: string; userId: string }) => {
  const token = cryptoTokens.newToken()
  await asOwner((db) =>
    db.query(
      `insert into house_invites (id, house_id, token_hash, created_by, expires_at, max_uses)
       values ($1, $2, $3, $4, now() + interval '7 days', 4)`,
      [randomUUID(), owner.houseId, cryptoTokens.hash(token), owner.userId],
    ),
  )
  return `/join/${token}`
}

/** Joins through a link: name + email → code → a room → Join the house → onboarding (T110). */
export const joinWith = async (page: Page, link: string, name: string, room: string) => {
  const email = freshEmail(name.toLowerCase())
  await page.goto(link)
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Your email').fill(email)
  await page.getByRole('button', { name: 'Send me a code' }).click()
  await page.getByLabel('6-digit code').fill(await latestCode(email))
  await expect(page.getByRole('heading', { name: 'Which room is yours?' })).toBeVisible()
  await page.getByRole('radio', { name: room }).click()
  await page.getByRole('button', { name: 'Join the house' }).click()
  await expect(page).toHaveURL(/\/welcome$/)
  return email
}

/** Signs in as a fresh owner, who lands on the House tab (T107). */
export const ownerOnHouseTab = async (page: Page) => {
  const owner = await anOwner('Kavya')
  await signIn(page, owner.email)
  await expect(page).toHaveURL(new RegExp(`/h/${owner.houseId}$`))
  await dismissInstallGuide(page)
  return owner
}

const TAB_FOR: Record<string, string> = {
  'A need': 'Needs',
  'A chore': 'Chores',
  'A task': 'Tasks',
}

/**
 * The kind's tab → + → title → Add: three taps and a title. The + shows only on Needs, Tasks and
 * Chores, and goes straight to that kind's form (T107).
 */
export const addWithThreeTaps = async (page: Page, tile: string, title: string) => {
  await page
    .getByRole('navigation', { name: 'Tabs' })
    .getByRole('link', { name: TAB_FOR[tile] })
    .click() // 1
  // Wait for the tab to land, or the + still on the last tab adds the last kind.
  await expect(page.getByRole('heading', { name: TAB_FOR[tile], level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Add', exact: true }).click() // 2
  const sheet = page.getByRole('dialog', { name: tile })
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
    /** Chores: absent means upkeep. */
    kind?: 'deep_clean' | 'upkeep'
    /** Chores: a name from lib/domain/icons.ts. */
    icon?: string
    /** Chores: the names of its rooms. */
    rooms?: readonly string[]
    lastDoneDaysAgo?: number
  },
) => {
  const id = randomUUID()
  await asOwner(async (db) => {
    await db.query(
      `insert into items (id, house_id, category, title, chore_kind, icon, last_done_at, last_done_by, created_by)
       values ($1, $2, $3, $4, $5, $8, now() - make_interval(days => $6::int), case when $6::int is null then null else $7::uuid end, $7)`,
      [
        id,
        owner.houseId,
        o.category,
        o.title,
        o.category === 'chore' ? (o.kind ?? 'upkeep') : null,
        o.lastDoneDaysAgo ?? null,
        owner.userId,
        o.icon ?? null,
      ],
    )
    if (o.rooms?.length) {
      await db.query(
        `insert into chore_rooms (house_id, item_id, room_id)
         select house_id, $2, id from rooms where house_id = $1 and name = any($3)`,
        [owner.houseId, id, o.rooms],
      )
    }
  })
  return id
}

/**
 * Puts a routine over some rooms straight into the database: `holder` has it this period, and it
 * takes turns among the house from there (or, with `fixed`, it's always theirs).
 */
export const aRoutine = async (
  owner: { houseId: string },
  o: {
    name: string
    icon?: string
    rooms: readonly string[]
    holder: string
    fixed?: boolean
    sortOrder?: number
  },
) => {
  const id = randomUUID()
  await asOwner(async (db) => {
    await db.query(
      `insert into routines (id, house_id, name, icon, resets, starts_on, starts_with, fixed_member_id, sort_order)
       values ($1, $2, $3, $4, 'weekly', date_trunc('week', now() at time zone 'America/New_York')::date, $5, $6, $7)`,
      [
        id,
        owner.houseId,
        o.name,
        o.icon ?? 'broom',
        o.fixed ? null : o.holder,
        o.fixed ? o.holder : null,
        o.sortOrder ?? 0,
      ],
    )
    await db.query('update rooms set routine_id = $1 where house_id = $2 and name = any($3)', [
      id,
      owner.houseId,
      o.rooms,
    ])
  })
  return id
}

/** Puts an open poll with its options straight into the database (for deep links). */
export const aPoll = async (
  owner: { houseId: string; userId: string },
  question: string,
  options: readonly string[] = ['Yes', 'No'],
) => {
  const id = randomUUID()
  await asOwner(async (db) => {
    await db.query(
      'insert into polls (id, house_id, question, created_by) values ($1, $2, $3, $4)',
      [id, owner.houseId, question, owner.userId],
    )
    for (const [i, label] of options.entries()) {
      await db.query(
        'insert into poll_options (id, poll_id, house_id, label, added_by, sort_order) values ($1, $2, $3, $4, $5, $6)',
        [randomUUID(), id, owner.houseId, label, owner.userId, i],
      )
    }
  })
  return id
}

/** Puts an open batch run straight into the database (for deep links). */
export const aRun = async (owner: { houseId: string; userId: string }, title: string) => {
  const id = randomUUID()
  await asOwner((db) =>
    db.query(
      `insert into runs (id, house_id, kind, title, runner_id, status, created_by)
       values ($1, $2, 'batch', $3, $4, 'open', $4)`,
      [id, owner.houseId, title, owner.userId],
    ),
  )
  return id
}

/** A real account that's already a (non-admin) member of the owner's house. */
export const aRoommate = async (owner: { houseId: string }, name = 'Sam') => {
  const email = freshEmail(name.toLowerCase())
  const r = await auth.createUser(email)
  if (!r.ok) throw new Error(r.error)
  const userId = r.value
  await asOwner(async (db) => {
    await db.query('insert into profiles (id, display_name) values ($1, $2)', [userId, name])
    await db.query(
      "insert into house_members (house_id, user_id, role) values ($1, $2, 'member')",
      [owner.houseId, userId],
    )
  })
  return { email, userId }
}
