import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  aDbHouse,
  asOwner,
  asUser,
  newId,
  pool,
  refused,
  type TestHouse,
} from '../../lib/testing/db'

// T45: `items.for_member` labels a need as one person's (null = the house's). Housemates see and
// work everyone's needs (the items policies cover the column); strangers see none; only needs
// carry it; and "already on the list" compares the title and whose it is.

let mine: TestHouse
let theirs: TestHouse

beforeAll(async () => {
  ;[mine, theirs] = await Promise.all([aDbHouse(), aDbHouse()])
})

afterAll(() => pool.end())

const insert = `insert into items (id, house_id, category, title, for_member, created_by)
  values ($1, $2, $3, $4, $5, $6)`

describe('a need for one person', () => {
  it('a member adds one for themselves; a housemate sees it and gets it', async () => {
    const id = newId()
    await asOwner((db) =>
      db.query(insert, [id, mine.houseId, 'need', 'Oat milk', mine.member, mine.member]),
    )
    await asUser(mine.admin, async (db) => {
      const seen = await db.query('select for_member from items where id = $1', [id])
      expect(seen.rows).toEqual([{ for_member: mine.member }])
      const got = await db.query('update items set done_at = now(), done_by = $2 where id = $1', [
        id,
        mine.admin,
      ])
      expect(got.rowCount).toBe(1)
    })
    await asUser(theirs.admin, async (db) => {
      expect((await db.query('select 1 from items where id = $1', [id])).rowCount).toBe(0)
      expect(
        (await db.query('update items set for_member = null where id = $1', [id])).rowCount,
      ).toBe(0)
    })
  })

  it('only needs carry it', async () => {
    await asUser(mine.member, async (db) => {
      expect(
        await refused(db, insert, [
          newId(),
          mine.houseId,
          'task',
          'Fix the latch',
          mine.member,
          mine.member,
        ]),
      ).toBe('23514')
    })
  })

  it("the house's Milk and a person's Milk are two needs; two of one person's are not", async () => {
    await asUser(mine.member, async (db) => {
      const add = (forMember: string | null) =>
        db.query(insert, [newId(), mine.houseId, 'need', 'Milk', forMember, mine.member])
      await add(null)
      await add(mine.member)
      await add(mine.admin)
      expect(
        await refused(db, insert, [
          newId(),
          mine.houseId,
          'need',
          ' milk ',
          mine.member,
          mine.member,
        ]),
      ).toBe('23505')
      expect(
        await refused(db, insert, [newId(), mine.houseId, 'need', 'MILK', null, mine.member]),
      ).toBe('23505')
    })
  })
})
