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

// T96: routines and chore_rooms. Any active member reads and writes their own house's, through the
// server; rows from another house stay out of reach, and same-house foreign keys hold.

let mine: TestHouse
let theirs: TestHouse

beforeAll(async () => {
  ;[mine, theirs] = await Promise.all([aDbHouse(), aDbHouse()])
})

afterAll(() => pool.end())

const insertRoutine = `insert into routines (id, house_id, name, icon, resets, starts_on, starts_with)
  values ($1, $2, 'Kitchen', 'utensils', 'weekly', '2026-11-02', $3)`
const insertChore = `insert into items (id, house_id, category, title, created_by, chore_kind)
  values ($1, $2, 'chore', 'Vacuum', $3, 'deep_clean')`

const seedRoutine = async (house: TestHouse) => {
  const id = newId()
  await asOwner((c) => c.query(insertRoutine, [id, house.houseId, house.admin]))
  return id
}
const seedChore = async (house: TestHouse) => {
  const id = newId()
  await asOwner((c) => c.query(insertChore, [id, house.houseId, house.admin]))
  return id
}

describe('routines', () => {
  it('a member adds, reads and changes their own house’s', async () => {
    const id = newId()
    await asUser(mine.member, async (c) => {
      await c.query(insertRoutine, [id, mine.houseId, mine.member])
      await c.query(`update routines set name = 'Kitchen and dining' where id = $1`, [id])
      const { rows } = await c.query(`select name from routines where id = $1`, [id])
      expect(rows[0].name).toBe('Kitchen and dining')
    })
  })

  it('another house can neither see, add nor change them', async () => {
    const id = await seedRoutine(mine)
    await asUser(theirs.member, async (c) => {
      const { rows } = await c.query(`select id from routines where id = $1`, [id])
      expect(rows).toEqual([])
      const { rowCount } = await c.query(`update routines set name = 'Mine now' where id = $1`, [
        id,
      ])
      expect(rowCount).toBe(0)
    })
    await asUser(theirs.member, async (c) => {
      expect(await refused(c, insertRoutine, [newId(), mine.houseId, theirs.member])).toBe('42501')
    })
  })

  it('nobody deletes one: activity points at it', async () => {
    const id = await seedRoutine(mine)
    await asUser(mine.member, async (c) => {
      expect(await refused(c, `delete from routines where id = $1`, [id])).toBe('42501')
    })
  })

  it('a room joins only a routine of its own house', async () => {
    const other = await seedRoutine(theirs)
    await expect(
      asOwner((c) =>
        c.query(`update rooms set routine_id = $1 where house_id = $2`, [other, mine.houseId]),
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })
})

describe('someone who moved out', () => {
  it("can't change the house's routines or a chore's rooms, or read them", async () => {
    const house = await aDbHouse()
    const routine = await seedRoutine(house)
    const chore = await seedChore(house)
    await asOwner((c) =>
      c.query(`insert into chore_rooms (house_id, item_id, room_id) values ($1, $2, $3)`, [
        house.houseId,
        chore,
        house.roomId,
      ]),
    )
    await asOwner((c) =>
      c.query(
        `update house_members set status = 'moved_out', left_at = now()
           where house_id = $1 and user_id = $2`,
        [house.houseId, house.member],
      ),
    )
    await asUser(house.member, async (c) => {
      expect((await c.query(`select id from routines where id = $1`, [routine])).rows).toEqual([])
      expect((await c.query(`select 1 from chore_rooms where item_id = $1`, [chore])).rows).toEqual(
        [],
      )
      const update = await c.query(`update routines set name = 'Mine' where id = $1`, [routine])
      expect(update.rowCount).toBe(0)
      const del = await c.query(`delete from chore_rooms where item_id = $1`, [chore])
      expect(del.rowCount).toBe(0)
      expect(await refused(c, insertRoutine, [newId(), house.houseId, house.member])).toBe('42501')
    })
  })
})

describe('chore_rooms', () => {
  const add = `insert into chore_rooms (house_id, item_id, room_id) values ($1, $2, $3)`

  it('a member adds, reads and removes them', async () => {
    const chore = await seedChore(mine)
    await asUser(mine.member, async (c) => {
      await c.query(add, [mine.houseId, chore, mine.roomId])
      const { rows } = await c.query(`select room_id from chore_rooms where item_id = $1`, [chore])
      expect(rows).toEqual([{ room_id: mine.roomId }])
      const { rowCount } = await c.query(`delete from chore_rooms where item_id = $1`, [chore])
      expect(rowCount).toBe(1)
    })
  })

  it('another house sees and deletes nothing, and adds nothing to this one', async () => {
    const chore = await seedChore(mine)
    await asOwner((c) => c.query(add, [mine.houseId, chore, mine.roomId]))
    await asUser(theirs.member, async (c) => {
      const { rows } = await c.query(`select 1 from chore_rooms where item_id = $1`, [chore])
      expect(rows).toEqual([])
      const { rowCount } = await c.query(`delete from chore_rooms where item_id = $1`, [chore])
      expect(rowCount).toBe(0)
    })
    await asUser(theirs.member, async (c) => {
      expect(await refused(c, add, [mine.houseId, chore, mine.roomId])).toBe('42501')
    })
  })

  it('a room must be in the chore’s house', async () => {
    const chore = await seedChore(mine)
    await expect(
      asOwner((c) => c.query(add, [mine.houseId, chore, theirs.roomId])),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('items keep kind and icon to chores', async () => {
    await expect(
      asOwner((c) =>
        c.query(
          `insert into items (id, house_id, category, title, created_by, chore_kind)
             values ($1, $2, 'need', 'Soap', $3, 'upkeep')`,
          [newId(), mine.houseId, mine.admin],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' })
  })
})
