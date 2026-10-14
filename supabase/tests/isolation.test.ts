// Cross-house isolation for every house-scoped table, found from the catalog, so a table added
// later is covered without touching this file (ARCHITECTURE §12: "RLS mistake leaks data").

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aDbHouse, asOwner, asUser, pool, type TestHouse } from '../../lib/testing/db'

let a: TestHouse
let b: TestHouse
let tables: { table: string; col: string }[]

beforeAll(async () => {
  ;[a, b] = await Promise.all([aDbHouse(), aDbHouse()])
  tables = (
    await asOwner((db) =>
      db.query(`
        select c.table_name as table, c.column_name as col
        from information_schema.columns c
        join information_schema.tables t using (table_schema, table_name)
        where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
          and (c.column_name = 'house_id' or (c.table_name = 'houses' and c.column_name = 'id'))
        order by 1`),
    )
  ).rows
})

afterAll(() => pool.end())

describe('a second house sees nothing of the first', () => {
  it('covers every house-scoped table', () => {
    expect(tables.map((t) => t.table)).toEqual(
      expect.arrayContaining([
        'activity_events',
        'contacts',
        'house_invites',
        'house_members',
        'houses',
        'notifications_outbox',
        'rooms',
      ]),
    )
  })

  it("members and admins of B read no row of A's, in any table", async () => {
    for (const reader of [b.member, b.admin]) {
      await asUser(reader, async (db) => {
        for (const { table, col } of tables) {
          const n = Number(
            (await db.query(`select count(*) from ${table} where ${col} = $1`, [a.houseId])).rows[0]
              .count,
          )
          expect({ reader: reader === b.admin ? 'admin' : 'member', table, n }).toMatchObject({
            n: 0,
          })
        }
      })
    }
  })

  it("members of B change no row of A's, in any table", async () => {
    await asUser(b.admin, async (db) => {
      for (const { table, col } of tables) {
        // A harmless self-assignment: RLS hides A's rows, so nothing matches (or the update is
        // refused outright where there's no UPDATE grant, as for the activity log).
        await db.query('savepoint touch')
        const outcome = await db
          .query(`update ${table} set ${col} = ${col} where ${col} = $1`, [a.houseId])
          .then((r) => r.rowCount)
          .catch((e: { code?: string }) => `refused ${e.code}`)
        await db.query('rollback to savepoint touch')
        expect({ table, outcome }).toEqual({
          table,
          outcome: expect.toBeOneOf([0, 'refused 42501']),
        })
      }
    })
  })
})
