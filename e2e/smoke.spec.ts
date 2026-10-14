// The smoke suite (DEPLOYMENT §5, TESTING.md §5): a short check of a deployed site, run with
// `pnpm test:smoke` (playwright.smoke.config.ts). It can't use e2e/support.ts, which mints tokens
// with the local secret and reads codes from Mailpit; it signs in through Supabase's admin API.
//
//   BASE_URL                 the site (unset: a local production build, keys from .env.local)
//   SMOKE_READ_ONLY=1        prod: only the signed-out checks; no account, no writes
//   SMOKE_SUPABASE_URL       the project's API URL            } write mode only (staging, local)
//   SMOKE_SERVICE_ROLE_KEY   its service-role key             }
//   SMOKE_EMAIL              the smoke account: a real inbox on staging (the sign-in form sends it
//                            a code; the test uses a fresh one from the admin API instead)
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '../lib/adapters/supabase/server'
import { APARTMENT_ROOMS } from '../lib/domain/rooms'

const env = process.env
const READ_ONLY = env.SMOKE_READ_ONLY === '1'
const PROD_REF = 'iqkriekufaebhvptjzhv'
const HOUSE_NAME = 'Smoke house'

test.describe('signed out', () => {
  test('sign-in renders with a nonce CSP, and house pages need a session', async ({ page }) => {
    const res = await page.goto('/sign-in')
    expect(res?.status()).toBe(200)
    expect(res?.headers()['content-security-policy']).toMatch(/'nonce-[^']+'/)
    await expect(page.getByRole('button', { name: 'Send me a code' })).toBeVisible()

    await page.goto(`/h/${randomUUID()}`)
    await expect(page).toHaveURL(/\/sign-in/)
  })

  test('the manifest is served and the cron routes want their secret', async ({ request }) => {
    expect((await request.get('/manifest.webmanifest')).ok()).toBe(true)
    const tick = await request.post('/api/cron/tick', { data: {} })
    expect(tick.status()).toBe(401)
  })
})

/** The smoke account and its house, made on first use (service role, so RLS doesn't apply). */
const smokeHouse = async (admin: SupabaseClient, email: string) => {
  const created = await admin.auth.admin.createUser({ email, email_confirm: true })
  let userId = created.data.user?.id
  if (!userId) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    userId = data.users.find((u) => u.email === email)?.id
    if (!userId)
      throw new Error(`Couldn't create or find the smoke account: ${created.error?.message}`)
  }
  const check = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`${what}: ${error.message}`)
  }
  check(
    'profile',
    (await admin.from('profiles').upsert({ id: userId, display_name: 'Smoke' })).error,
  )

  const member = await admin
    .from('house_members')
    .select('house_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
  check('membership', member.error)
  const existing = member.data?.[0]?.house_id as string | undefined
  if (existing) return { userId, houseId: existing }

  const houseId = randomUUID()
  check(
    'house',
    (
      await admin.from('houses').insert({
        id: houseId,
        name: HOUSE_NAME,
        created_by: userId,
        settings: { timezone: 'America/New_York', feeling_weights: {}, invite_ttl_days: 7 },
      })
    ).error,
  )
  check(
    'member',
    (
      await admin
        .from('house_members')
        .insert({ house_id: houseId, user_id: userId, role: 'admin' })
    ).error,
  )
  check(
    'rooms',
    (
      await admin.from('rooms').insert(
        APARTMENT_ROOMS.map((r, i) => ({
          id: randomUUID(),
          house_id: houseId,
          name: r.name,
          floor: r.floor,
          kind: r.kind,
          element: r.element ?? null,
          sort_order: i,
        })),
      )
    ).error,
  )
  return { userId, houseId }
}

/** A sign-in code from the admin API, waiting out the per-account email interval if needed. */
const freshCode = async (admin: SupabaseClient, email: string): Promise<string> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const code = data.properties?.email_otp
    if (!error && code) return code
    const wait = Number(error?.message.match(/after (\d+) seconds?/)?.[1])
    if (!wait) throw new Error(`generateLink: ${error?.message ?? 'no code'}`)
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000))
  }
  throw new Error('generateLink kept asking to wait')
}

test.describe('signed in', () => {
  test.skip(READ_ONLY, 'Read-only mode (prod): no account, no writes.')

  test('a need goes from added to got, and Activity shows both', async ({ page }) => {
    test.setTimeout(180_000)
    const url = env.SMOKE_SUPABASE_URL
    const key = env.SMOKE_SERVICE_ROLE_KEY
    const email = env.SMOKE_EMAIL?.trim().toLowerCase()
    if (!url || !key || !email) {
      throw new Error(
        'Write mode needs SMOKE_SUPABASE_URL, SMOKE_SERVICE_ROLE_KEY and SMOKE_EMAIL.',
      )
    }
    if (url.includes(PROD_REF)) throw new Error('Never write to prod: set SMOKE_READ_ONLY=1.')

    const admin = adminClient(url, key)
    const { houseId } = await smokeHouse(admin, email)

    await page.goto('/sign-in')
    await page.getByLabel('Your email').fill(email)
    await page.getByRole('button', { name: 'Send me a code' }).click()
    const codeField = page.getByLabel('6-digit code')
    await expect(codeField).toBeVisible()
    // The admin API's code replaces the emailed one.
    await codeField.fill(await freshCode(admin, email))
    await expect(page).toHaveURL(new RegExp(`/h/${houseId}$`))

    // The iPhone profile is mobile Safari, so the Home Screen guide opens first.
    const guide = page.getByRole('dialog', { name: 'Add Roomies to your Home Screen' })
    await guide.getByRole('button', { name: 'Maybe later' }).click()
    await expect(guide).toBeHidden()

    const title = `Smoke ${randomUUID().slice(0, 8)}`
    await page.goto(`/h/${houseId}/needs`)
    const weNeed = page.getByLabel('We need…')
    await weNeed.fill(title)
    await weNeed.press('Enter')
    const list = page.getByRole('list', { name: 'Needs' })
    await expect(list).toContainText(title)

    await list.getByRole('button', { name: `Got it: ${title}` }).click()
    await expect(page.getByRole('status').filter({ hasText: `Got ${title}.` })).toBeVisible()
    await expect(list.getByRole('listitem').filter({ hasText: title })).toHaveCount(0)

    await page.goto(`/h/${houseId}/activity`)
    await expect(
      page.getByRole('button', { name: new RegExp(`Smoke added .*${title}`) }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: new RegExp(`Smoke got .*${title}`) }),
    ).toBeVisible()
  })
})
