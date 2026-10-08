import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { afterAll } from 'vitest'
import type { HouseId, UserId } from '../../domain/ids'
import { houseQueriesContract } from '../contracts/house-queries.contract'
import { cryptoIds } from '../ids'
import { activityToDomain } from '../postgres/mappers'
import { createDb, PostgresUnitOfWork } from '../postgres/unit-of-work'
import { supabaseHouseQueries } from './house-queries'
import { mintJwt } from '../../testing/jwt'

// Local Supabase only: its well-known development JWT secret signs test sessions.
const API_URL = process.env.TEST_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const APP_URL =
  process.env.TEST_APP_DATABASE_URL ??
  'postgresql://app_server:app-server-local-only@127.0.0.1:54322/postgres'
const OWNER_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const anonKey = mintJwt({ role: 'anon', aud: undefined })

const db = createDb(APP_URL, 2)
const owner = new pg.Pool({ connectionString: OWNER_URL, max: 1 })
afterAll(async () => {
  await db.destroy()
  await owner.end()
})

houseQueriesContract('supabase (PostgREST + RLS)', async () => ({
  uow: new PostgresUnitOfWork(db),
  ids: cryptoIds,
  createUser: async () => cryptoIds.newId<'user'>() as UserId,
  activity: async (houseId: HouseId) =>
    (
      await owner.query('select * from activity_events where house_id = $1 order by id', [houseId])
    ).rows.map(activityToDomain),
  queriesFor: (userId) => {
    const token = mintJwt({ sub: userId, role: 'authenticated' })
    const sb = createClient(API_URL, anonKey, {
      accessToken: async () => token,
      auth: { persistSession: false },
    })
    return supabaseHouseQueries(sb)
  },
}))
