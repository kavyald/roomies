import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aDbHouse, asOwner, asUser, newId, pool, type TestHouse } from '../../lib/testing/db'

// T55: taking back your vote ("poll votes withdraw own while open"), and reopening a poll or
// changing its deadline through "polls update" (any member; closed_at and closes_at clear).

let mine: TestHouse
let theirs: TestHouse

beforeAll(async () => {
  ;[mine, theirs] = await Promise.all([aDbHouse(), aDbHouse()])
})

afterAll(() => pool.end())

/** A poll in my house with two options, both of us voted; closed if asked. */
const aPoll = async (closed = false) => {
  const poll = newId()
  const [a, b] = [newId(), newId()]
  await asOwner(async (db) => {
    await db.query(
      `insert into polls (id, house_id, question, closes_at, closed_at, created_by)
       values ($1, $2, 'House name?', now() + interval '1 day', $3, $4)`,
      [poll, mine.houseId, closed ? new Date(0) : null, mine.admin],
    )
    await db.query(
      `insert into poll_options (id, poll_id, house_id, label, added_by, sort_order)
       values ($1, $3, $4, 'The Nest', $5, 0), ($2, $3, $4, 'Burrow', $5, 1)`,
      [a, b, poll, mine.houseId, mine.admin],
    )
    await db.query(
      `insert into poll_votes (poll_id, user_id, house_id, option_id)
       values ($1, $2, $4, $5), ($1, $3, $4, $5)`,
      [poll, mine.admin, mine.member, mine.houseId, a],
    )
  })
  return poll
}

const withdraw = `delete from poll_votes where poll_id = $1 and user_id = $2`
const votesIn = async (poll: string) =>
  asOwner(async (db) =>
    (
      await db.query(`select user_id from poll_votes where poll_id = $1 order by user_id`, [poll])
    ).rows.map((r) => r.user_id as string),
  )

describe('taking back a vote', () => {
  it('a member deletes their own vote while the poll is open, and nobody else’s', async () => {
    const poll = await aPoll()
    await asUser(mine.member, async (db) => {
      expect((await db.query(withdraw, [poll, mine.admin])).rowCount).toBe(0)
      expect((await db.query(withdraw, [poll, mine.member])).rowCount).toBe(1)
      expect(
        (await db.query(`select count(*) from poll_votes where poll_id = $1`, [poll])).rows,
      ).toEqual([{ count: '1' }])
    })
  })

  it('a closed poll keeps its votes', async () => {
    const poll = await aPoll(true)
    await asUser(mine.member, async (db) => {
      expect((await db.query(withdraw, [poll, mine.member])).rowCount).toBe(0)
    })
    expect(await votesIn(poll)).toEqual([mine.admin, mine.member].sort())
  })

  it("someone from another house can't touch them", async () => {
    const poll = await aPoll()
    await asUser(theirs.admin, async (db) => {
      expect((await db.query(`delete from poll_votes where poll_id = $1`, [poll])).rowCount).toBe(0)
    })
    expect(await votesIn(poll)).toHaveLength(2)
  })
})

describe('reopening and the deadline', () => {
  it('any member reopens a closed poll, and can then take back their vote', async () => {
    const poll = await aPoll(true)
    await asUser(mine.member, async (db) => {
      expect(
        (
          await db.query(`update polls set closed_at = null, closes_at = null where id = $1`, [
            poll,
          ])
        ).rowCount,
      ).toBe(1)
      expect((await db.query(withdraw, [poll, mine.member])).rowCount).toBe(1)
    })
  })

  it('any member moves or clears the deadline; another house cannot', async () => {
    const poll = await aPoll()
    await asUser(mine.member, async (db) => {
      expect(
        (
          await db.query(`update polls set closes_at = now() + interval '3 days' where id = $1`, [
            poll,
          ])
        ).rowCount,
      ).toBe(1)
      expect(
        (await db.query(`update polls set closes_at = null where id = $1`, [poll])).rowCount,
      ).toBe(1)
    })
    await asUser(theirs.member, async (db) => {
      expect(
        (await db.query(`update polls set closes_at = null where id = $1`, [poll])).rowCount,
      ).toBe(0)
    })
  })
})
