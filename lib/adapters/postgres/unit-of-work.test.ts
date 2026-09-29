import { sql } from 'kysely'
import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import type { HouseId, UserId } from '../../domain/ids'
import { asMember, seedHouse, system, unitOfWorkContract } from '../contracts/unit-of-work.contract'
import { cryptoIds } from '../ids'
import { activityToDomain } from './mappers'
import { createDb, PostgresUnitOfWork } from './unit-of-work'

// The app connects as app_server (password set by supabase/seed.sql for local use only).
const APP_URL =
  process.env.TEST_APP_DATABASE_URL ??
  'postgresql://app_server:app-server-local-only@127.0.0.1:54322/postgres'
const OWNER_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const db = createDb(APP_URL, 1) // one connection: role changes must not leak between transactions
const owner = new pg.Pool({ connectionString: OWNER_URL, max: 2 })
const uow = new PostgresUnitOfWork(db)

afterAll(async () => {
  await db.destroy()
  await owner.end()
})

const harness = {
  uow,
  ids: cryptoIds,
  createUser: async () => cryptoIds.newId<'user'>() as UserId,
  activity: async (houseId: HouseId) =>
    (
      await owner.query('select * from activity_events where house_id = $1 order by id', [houseId])
    ).rows.map(activityToDomain),
}

unitOfWorkContract('postgres', async () => harness)

describe('Postgres UnitOfWork: the session inside a transaction', () => {
  const whoAmI = (actor: Parameters<typeof uow.transaction>[0]) =>
    uow.transaction(actor, async (trx) => {
      const { rows } = await sql<{ uid: string | null; role: string }>`
        select auth.uid() as uid, current_user as role`.execute(trx)
      return rows[0]!
    })

  it('auth.uid() is the acting member, under the authenticated role', async () => {
    const { house, member } = await seedHouse(harness)
    expect(await whoAmI(asMember(house.id, member))).toEqual({ uid: member, role: 'authenticated' })
  })

  it('jobs run as service_role with no user', async () => {
    const { house } = await seedHouse(harness)
    expect(await whoAmI(system(house.id))).toEqual({ uid: null, role: 'service_role' })
  })

  it("one transaction's role and claims don't leak into the next", async () => {
    const { house, member } = await seedHouse(harness)
    await whoAmI(asMember(house.id, member))
    const after = await db.transaction().execute(
      async (trx) =>
        (
          await sql<{ claims: string | null; role: string }>`
            select nullif(current_setting('request.jwt.claims', true), '') as claims,
                   current_user as role`.execute(trx)
        ).rows[0],
    )
    expect(after).toEqual({ claims: null, role: 'app_server' })
  })

  it('app_server on its own can read nothing', async () => {
    await expect(sql`select count(*) from houses`.execute(db)).rejects.toMatchObject({
      code: '42501',
    })
  })
})
