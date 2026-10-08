// The DEPLOYMENT §8 fixes (migration rls_fixes, ARCHITECTURE §5.2): member_role answers only the
// house's active members, and the outbox takes messages only for the house's active members.
// Mirrored in lib/adapters/memory/db.ts.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aDbHouse, asOwner, asUser, pool, refused, type TestHouse } from '../../lib/testing/db'

const INSUFFICIENT_PRIVILEGE = '42501'

let mine: TestHouse
let theirs: TestHouse

beforeAll(async () => {
  ;[mine, theirs] = await Promise.all([aDbHouse(), aDbHouse()])
})

afterAll(() => pool.end())

const roleOf = (db: import('../../lib/testing/db').Db, houseId: string, userId: string) =>
  db
    .query<{ role: string | null }>('select private.member_role($1, $2) as role', [houseId, userId])
    .then((r) => r.rows[0]!.role)

const moveOut = (h: TestHouse, userId: string) =>
  asOwner((db) =>
    db.query(
      `update house_members set status = 'moved_out', left_at = now()
       where house_id = $1 and user_id = $2`,
      [h.houseId, userId],
    ),
  )

describe('member_role', () => {
  it("answers a member about their housemates, and nobody else about anyone's", async () => {
    await asUser(mine.member, async (db) => {
      expect(await roleOf(db, mine.houseId, mine.admin)).toBe('admin')
      expect(await roleOf(db, theirs.houseId, theirs.admin)).toBeNull()
    })
    await asUser(theirs.admin, async (db) => {
      expect(await roleOf(db, mine.houseId, mine.admin)).toBeNull()
    })
  })

  it('stops answering someone who moved out', async () => {
    const h = await aDbHouse()
    await moveOut(h, h.member)
    await asUser(h.member, async (db) => {
      expect(await roleOf(db, h.houseId, h.admin)).toBeNull()
    })
  })
})

describe('outbox enqueue', () => {
  const enqueue = `insert into notifications_outbox (house_id, user_id, category, title, body, url)
    values ($1, $2, 'items', 'Title', 'Body', '/')`

  it('a member enqueues for a housemate', async () => {
    await asUser(mine.member, async (db) => {
      expect((await db.query(enqueue, [mine.houseId, mine.admin])).rowCount).toBe(1)
    })
  })

  it('refuses a message for someone outside the house', async () => {
    await asUser(mine.member, async (db) => {
      expect(await refused(db, enqueue, [mine.houseId, theirs.member])).toBe(INSUFFICIENT_PRIVILEGE)
    })
  })

  it('refuses a message for someone who moved out', async () => {
    const h = await aDbHouse()
    await moveOut(h, h.member)
    await asUser(h.admin, async (db) => {
      expect(await refused(db, enqueue, [h.houseId, h.member])).toBe(INSUFFICIENT_PRIVILEGE)
    })
  })
})
