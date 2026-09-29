// Shared setup for journeys: each test makes its own account and house (TESTING.md §4).
import { randomUUID } from 'node:crypto'
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
