// Database test helpers (TESTING.md §4). Tests connect as `postgres` to set up rows, and use
// asUser() to act the way the app does: `set local role authenticated` plus the user's JWT claims,
// the same mechanism as the Postgres UnitOfWork, so RLS applies and auth.uid() is the user.

import { randomUUID } from 'node:crypto'
import pg from 'pg'

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 8 })

export type Db = pg.PoolClient

/** Runs `fn` in a transaction as the database owner (no RLS). */
export const asOwner = async <T>(fn: (db: Db) => Promise<T>): Promise<T> => {
  const db = await pool.connect()
  try {
    await db.query('begin')
    const out = await fn(db)
    await db.query('commit')
    return out
  } catch (e) {
    await db.query('rollback')
    throw e
  } finally {
    db.release()
  }
}

/** Runs `fn` in a transaction as a signed-in user (RLS applies). Rolls back afterwards. */
export const asUser = async <T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> => {
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query('set local role authenticated')
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    return await fn(db)
  } finally {
    await db.query('rollback')
    db.release()
  }
}

/** Like asUser, but commits: for changes a later step should see. */
export const asUserCommitted = async <T>(
  userId: string,
  fn: (db: Db) => Promise<T>,
): Promise<T> => {
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query('set local role authenticated')
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    const out = await fn(db)
    await db.query('commit')
    return out
  } catch (e) {
    await db.query('rollback')
    throw e
  } finally {
    db.release()
  }
}

/** Runs `fn` as a signed-out visitor (the `anon` role). Rolls back afterwards. */
export const asAnon = async <T>(fn: (db: Db) => Promise<T>): Promise<T> => {
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query('set local role anon')
    return await fn(db)
  } finally {
    await db.query('rollback')
    db.release()
  }
}

/** A query that must fail; resolves to the Postgres error code. Uses a savepoint so the
 * surrounding transaction survives. */
export const refused = async (db: Db, sql: string, params: unknown[] = []): Promise<string> => {
  await db.query('savepoint refused')
  try {
    await db.query(sql, params)
  } catch (e) {
    await db.query('rollback to savepoint refused')
    return (e as { code?: string }).code ?? 'unknown'
  }
  await db.query('release savepoint refused')
  throw new Error(`Expected this to be refused: ${sql}`)
}

export const newId = (): string => randomUUID()

export type TestHouse = {
  houseId: string
  admin: string
  member: string
  roomId: string
  contactId: string
}

/** A house with an admin, a member, a room, a contact, an invite and one activity row. */
export const aDbHouse = async (): Promise<TestHouse> => {
  const h: TestHouse = {
    houseId: newId(),
    admin: newId(),
    member: newId(),
    roomId: newId(),
    contactId: newId(),
  }
  await asOwner(async (db) => {
    await db.query(`insert into profiles (id, display_name) values ($1, 'Kavya'), ($2, 'Wren')`, [
      h.admin,
      h.member,
    ])
    await db.query(
      `insert into houses (id, name, created_by, settings) values ($1, 'The apartment', $2, $3)`,
      [
        h.houseId,
        h.admin,
        {
          timezone: 'America/New_York',
          feeling_weights: {
            anxious: 20,
            frustrated: 15,
            confused: 5,
            fine: 0,
            meh: -5,
            thanks: 0,
          },
          invite_ttl_days: 7,
        },
      ],
    )
    await db.query(
      `insert into rooms (id, house_id, name, floor, kind, element) values ($1, $2, 'Water', 'first', 'bedroom', 'water')`,
      [h.roomId, h.houseId],
    )
    await db.query(
      `insert into house_members (house_id, user_id, role, room_id) values ($1, $2, 'admin', null), ($1, $3, 'member', $4)`,
      [h.houseId, h.admin, h.member, h.roomId],
    )
    await db.query(
      `insert into contacts (id, house_id, name, phone) values ($1, $2, 'Super', '555-0100')`,
      [h.contactId, h.houseId],
    )
    await db.query(
      `insert into house_invites (id, house_id, token_hash, created_by, expires_at, max_uses)
       values ($1, $2, $3, $4, now() + interval '7 days', 3)`,
      [newId(), h.houseId, `hash-${h.houseId}`, h.admin],
    )
    await db.query(
      `insert into activity_events (house_id, actor_id, action_id, kind) values ($1, $2, $3, 'house.created')`,
      [h.houseId, h.admin, newId()],
    )
    await db.query(
      `insert into notifications_outbox (user_id, house_id, category, title, body, url) values ($1, $2, 'test', 'Hi', 'Welcome', '/')`,
      [h.member, h.houseId],
    )
  })
  return h
}
