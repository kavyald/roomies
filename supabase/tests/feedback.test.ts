import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  aDbHouse,
  asAnon,
  asBrowser,
  asOwner,
  asUser,
  asUserCommitted,
  newId,
  pool,
  refused,
  type TestHouse,
} from '../../lib/testing/db'

// T91: "feedback insert own". A member sends feedback in their own name for their own house,
// through the server; nobody but the owner (service_role, in the dashboard) reads it back.

const INSUFFICIENT_PRIVILEGE = '42501'
const CHECK_VIOLATION = '23514'

let mine: TestHouse
let theirs: TestHouse

beforeAll(async () => {
  ;[mine, theirs] = await Promise.all([aDbHouse(), aDbHouse()])
})

afterAll(() => pool.end())

const insert = `insert into feedback (id, house_id, user_id, kind, message, app_version, user_agent)
  values ($1, $2, $3, $4, $5, 'dev', 'Mozilla/5.0 (iPhone)')`
const row = (
  house: string,
  user: string,
  kind = 'idea',
  message = 'A dark mode for the calendar',
) => [newId(), house, user, kind, message]

describe('feedback insert own', () => {
  it('a member sends feedback for their house, stored with who sent it', async () => {
    const [id, ...rest] = row(mine.houseId, mine.member, 'bug')
    await asUserCommitted(mine.member, (db) => db.query(insert, [id, ...rest]))
    const { rows } = await asOwner((db) =>
      db.query(
        'select house_id, user_id, kind, app_version, user_agent from feedback where id = $1',
        [id],
      ),
    )
    expect(rows).toEqual([
      {
        house_id: mine.houseId,
        user_id: mine.member,
        kind: 'bug',
        app_version: 'dev',
        user_agent: 'Mozilla/5.0 (iPhone)',
      },
    ])
  })

  it('not in someone else’s name, and not for a house you’re not in', async () => {
    await asUser(mine.member, async (db) => {
      expect(await refused(db, insert, row(mine.houseId, mine.admin))).toBe(INSUFFICIENT_PRIVILEGE)
      expect(await refused(db, insert, row(theirs.houseId, mine.member))).toBe(
        INSUFFICIENT_PRIVILEGE,
      )
    })
  })

  it('after moving out, you can’t send any more', async () => {
    await asOwner((db) =>
      db.query(
        `update house_members set status = 'moved_out', left_at = now() where house_id = $1 and user_id = $2`,
        [theirs.houseId, theirs.member],
      ),
    )
    await asUser(theirs.member, async (db) => {
      expect(await refused(db, insert, row(theirs.houseId, theirs.member))).toBe(
        INSUFFICIENT_PRIVILEGE,
      )
    })
  })

  it('an empty or too-long message is refused', async () => {
    await asUser(mine.member, async (db) => {
      expect(await refused(db, insert, row(mine.houseId, mine.member, 'idea', '   '))).toBe(
        CHECK_VIOLATION,
      )
      expect(
        await refused(db, insert, row(mine.houseId, mine.member, 'idea', 'x'.repeat(2001))),
      ).toBe(CHECK_VIOLATION)
      expect(await refused(db, insert, row(mine.houseId, mine.member, 'rant'))).toBe(
        CHECK_VIOLATION,
      )
    })
  })
})

describe('nobody reads feedback but the owner', () => {
  it('members, the browser and visitors are refused', async () => {
    const read = 'select id from feedback'
    await asUser(mine.admin, async (db) => {
      expect(await refused(db, read)).toBe(INSUFFICIENT_PRIVILEGE)
    })
    await asBrowser(mine.member, async (db) => {
      expect(await refused(db, read)).toBe(INSUFFICIENT_PRIVILEGE)
      expect(await refused(db, insert, row(mine.houseId, mine.member))).toBe(INSUFFICIENT_PRIVILEGE)
    })
    await asAnon(async (db) => {
      expect(await refused(db, read)).toBe(INSUFFICIENT_PRIVILEGE)
    })
  })

  it('service_role reads and clears it', async () => {
    const { rows } = await asOwner(async (db) => {
      await db.query('set local role service_role')
      const r = await db.query('select count(*)::int as n from feedback where house_id = $1', [
        mine.houseId,
      ])
      await db.query('delete from feedback where house_id = $1', [theirs.houseId])
      return r
    })
    expect(rows[0].n).toBeGreaterThan(0)
  })
})
