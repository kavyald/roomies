// Shared by the suites that run against a deployed site (smoke.spec.ts, perf.spec.ts). They can't
// use e2e/support.ts, which mints tokens with the local secret and reads codes from Mailpit; these
// go through Supabase's admin API instead (TESTING.md §5).
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { APARTMENT_ROOMS } from '../lib/domain/rooms'

/** roomies-prod's project ref: nothing here may write to it. */
export const PROD_REF = 'iqkriekufaebhvptjzhv'

export const check = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`)
}

/** The account for `email`, made on first use (service role, so RLS doesn't apply). */
export const accountFor = async (
  admin: SupabaseClient,
  email: string,
  displayName: string,
): Promise<string> => {
  const created = await admin.auth.admin.createUser({ email, email_confirm: true })
  let userId = created.data.user?.id
  if (!userId) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    userId = data.users.find((u) => u.email === email)?.id
    if (!userId) throw new Error(`Couldn't create or find ${email}: ${created.error?.message}`)
  }
  check(
    'profile',
    (await admin.from('profiles').upsert({ id: userId, display_name: displayName })).error,
  )
  return userId
}

/** The house the account is an active member of, if any. */
export const activeHouseOf = async (admin: SupabaseClient, userId: string) => {
  const member = await admin
    .from('house_members')
    .select('house_id, houses(name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
  check('membership', member.error)
  const row = member.data?.[0] as
    { house_id: string; houses: { name: string } | { name: string }[] | null } | undefined
  if (!row) return null
  const house = Array.isArray(row.houses) ? row.houses[0] : row.houses
  return { houseId: row.house_id, name: house?.name ?? '' }
}

/** A new house with the apartment's rooms, and `userId` as its organizer. */
export const newHouse = async (admin: SupabaseClient, userId: string, name: string) => {
  const houseId = randomUUID()
  check(
    'house',
    (
      await admin.from('houses').insert({
        id: houseId,
        name,
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
  return houseId
}

/** The account and its house, each made on first use. */
export const accountWithHouse = async (
  admin: SupabaseClient,
  email: string,
  o: { displayName: string; houseName: string },
) => {
  const userId = await accountFor(admin, email, o.displayName)
  const existing = await activeHouseOf(admin, userId)
  return { userId, houseId: existing?.houseId ?? (await newHouse(admin, userId, o.houseName)) }
}

/** A sign-in code from the admin API, waiting out the per-account email interval if needed. */
export const freshCode = async (admin: SupabaseClient, email: string): Promise<string> => {
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
