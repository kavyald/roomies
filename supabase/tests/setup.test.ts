// The setup-once rule, on the real policies. Other tests always leave houses behind, so this runs
// inside one transaction that first removes every house and is rolled back at the end.

import { afterAll, describe, expect, it } from 'vitest'
import { newId, pool, refused } from '../../lib/testing/db'

afterAll(() => pool.end())

const settings = { timezone: 'America/New_York', feeling_weights: {}, invite_ttl_days: 7 }

describe('house setup policies', () => {
  it('the first account creates the only house and claims it; nobody else can', async () => {
    const db = await pool.connect()
    const owner = newId()
    const other = newId()
    const house = newId()
    const actAs = async (userId: string) => {
      await db.query('set local role authenticated')
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ])
    }
    try {
      await db.query('begin')
      // Hold new houses back until the rollback, so "no house exists" stays true while we test it.
      await db.query('lock table houses in exclusive mode')
      await db.query('delete from houses') // cascades; rolled back below
      await db.query("insert into profiles (id, display_name) values ($1, 'Kavya'), ($2, 'Sam')", [
        owner,
        other,
      ])

      await actAs(other)
      const insertHouse =
        'insert into houses (id, name, created_by, settings) values ($1, $2, $3, $4)'
      // Nobody can create a house in someone else's name.
      expect(await refused(db, insertHouse, [newId(), 'Theirs', owner, settings])).toBe('42501')

      await db.query('reset role')
      await actAs(owner)
      expect((await db.query('select public.no_house_exists() as ok')).rows[0].ok).toBe(true)
      await db.query(insertHouse, [house, 'The apartment', owner, settings])
      await db.query(
        "insert into house_members (house_id, user_id, role) values ($1, $2, 'admin')",
        [house, owner],
      )
      await db.query(
        "insert into rooms (id, house_id, name, floor, kind) values ($1, $2, 'Kitchen', 'first', 'common')",
        [newId(), house],
      )
      expect((await db.query('select public.no_house_exists() as ok')).rows[0].ok).toBe(false)

      // A second house is refused, even for the owner.
      expect(await refused(db, insertHouse, [newId(), 'Another', owner, settings])).toBe('42501')

      // Someone else can't claim the house by adding themselves.
      await db.query('reset role')
      await actAs(other)
      expect(
        await refused(
          db,
          "insert into house_members (house_id, user_id, role) values ($1, $2, 'admin')",
          [house, other],
        ),
      ).toBe('42501')
    } finally {
      await db.query('rollback')
      db.release()
    }
  })
})
