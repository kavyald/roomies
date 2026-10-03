import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  aDbHouse,
  asAnon,
  asOwner,
  asUser,
  asUserCommitted,
  newId,
  pool,
  refused,
  type TestHouse,
} from '../../lib/testing/db'

// Every house-scoped table, with the column that ties a row to its house.
const HOUSE_TABLES = [
  ['houses', 'id'],
  ['rooms', 'house_id'],
  ['house_members', 'house_id'],
  ['house_invites', 'house_id'],
  ['contacts', 'house_id'],
  ['activity_events', 'house_id'],
  ['notifications_outbox', 'house_id'],
] as const

// Tables added from M2 on (items and what hangs off them), checked for strangers and anon too.
const ITEM_TABLES = [
  'items',
  'feelings',
  'runs',
  'polls',
  'poll_options',
  'poll_votes',
  'costs',
  'notification_prefs',
] as const

const INSUFFICIENT_PRIVILEGE = '42501'

let mine: TestHouse
let theirs: TestHouse

beforeAll(async () => {
  ;[mine, theirs] = await Promise.all([aDbHouse(), aDbHouse()])
})

afterAll(() => pool.end())

const countIn = async (
  db: import('../../lib/testing/db').Db,
  table: string,
  col: string,
  houseId: string,
) =>
  Number(
    (await db.query(`select count(*) from ${table} where ${col} = $1`, [houseId])).rows[0].count,
  )

describe('RLS is on everywhere', () => {
  it('every table in public has row-level security enabled', async () => {
    const { rows } = await asOwner((db) =>
      db.query(`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
      `),
    )
    expect(rows.map((r) => r.relname)).toEqual([])
  })

  it('nothing is deleted except your own current feeling or open vote (history is in activity)', async () => {
    const { rows } = await asOwner((db) =>
      db.query(
        `select tablename, policyname from pg_policies where schemaname = 'public' and cmd = 'DELETE' order by tablename`,
      ),
    )
    expect(rows).toEqual([
      { tablename: 'feelings', policyname: 'feelings delete own' },
      { tablename: 'poll_votes', policyname: 'poll votes withdraw own while open' },
    ])
  })
})

describe('reading', () => {
  it('a signed-in stranger reads nothing', async () => {
    const stranger = newId()
    await asUser(stranger, async (db) => {
      for (const [table, col] of HOUSE_TABLES) {
        expect({ table, n: await countIn(db, table, col, mine.houseId) }).toEqual({ table, n: 0 })
      }
      expect(Number((await db.query('select count(*) from profiles')).rows[0].count)).toBe(0)
    })
  })

  it('a signed-in stranger reads nothing from the item tables either', async () => {
    const stranger = newId()
    await asUser(stranger, async (db) => {
      for (const table of ITEM_TABLES) {
        const n = Number((await db.query(`select count(*) from ${table}`)).rows[0].count)
        expect({ table, n }).toEqual({ table, n: 0 })
      }
    })
    await asAnon(async (db) => {
      for (const table of ITEM_TABLES) {
        expect({ table, code: await refused(db, `select 1 from ${table} limit 1`) }).toEqual({
          table,
          code: INSUFFICIENT_PRIVILEGE,
        })
      }
    })
  })

  it('nobody deletes runs, polls, options, or costs (votes: poll-votes.test.ts)', async () => {
    await asUser(mine.member, async (db) => {
      for (const table of ['runs', 'polls', 'poll_options', 'costs']) {
        expect({ table, code: await refused(db, `delete from ${table}`) }).toEqual({
          table,
          code: INSUFFICIENT_PRIVILEGE,
        })
      }
    })
  })

  it('a signed-out visitor has no access to any table', async () => {
    await asAnon(async (db) => {
      for (const [table] of [...HOUSE_TABLES, ['profiles']]) {
        expect({ table, code: await refused(db, `select 1 from ${table} limit 1`) }).toEqual({
          table,
          code: INSUFFICIENT_PRIVILEGE,
        })
      }
    })
  })

  it("a member reads their house, and nothing of another house's", async () => {
    await asUser(mine.member, async (db) => {
      expect(await countIn(db, 'houses', 'id', mine.houseId)).toBe(1)
      expect(await countIn(db, 'rooms', 'house_id', mine.houseId)).toBe(1)
      expect(await countIn(db, 'house_members', 'house_id', mine.houseId)).toBe(2)
      expect(await countIn(db, 'contacts', 'house_id', mine.houseId)).toBe(1)
      expect(await countIn(db, 'activity_events', 'house_id', mine.houseId)).toBe(1)
      expect(await countIn(db, 'notifications_outbox', 'house_id', mine.houseId)).toBe(1)
      for (const [table, col] of HOUSE_TABLES) {
        expect({ table, n: await countIn(db, table, col, theirs.houseId) }).toEqual({ table, n: 0 })
      }
      const names = (await db.query('select id from profiles')).rows.map((r) => r.id).sort()
      expect(names).toEqual([mine.admin, mine.member].sort())
    })
  })

  it('members see only their own notifications, and only admins see invites', async () => {
    await asUser(mine.admin, async (db) => {
      expect(await countIn(db, 'notifications_outbox', 'house_id', mine.houseId)).toBe(0)
      expect(await countIn(db, 'house_invites', 'house_id', mine.houseId)).toBe(1)
    })
    await asUser(mine.member, async (db) => {
      expect(await countIn(db, 'house_invites', 'house_id', mine.houseId)).toBe(0)
    })
  })

  it('someone who moved out sees only their own membership row', async () => {
    const h = await aDbHouse()
    await asOwner((db) =>
      db.query(
        `update house_members set status = 'moved_out', left_at = now() where house_id = $1 and user_id = $2`,
        [h.houseId, h.member],
      ),
    )
    await asUser(h.member, async (db) => {
      expect(await countIn(db, 'houses', 'id', h.houseId)).toBe(0)
      expect(await countIn(db, 'contacts', 'house_id', h.houseId)).toBe(0)
      const rows = (
        await db.query('select user_id, status from house_members where house_id = $1', [h.houseId])
      ).rows
      expect(rows).toEqual([{ user_id: h.member, status: 'moved_out' }])
    })
  })
})

describe('writing', () => {
  it("a member can add to their own house but not to someone else's", async () => {
    await asUser(mine.member, async (db) => {
      await db.query(`insert into contacts (id, house_id, name) values ($1, $2, 'Plumber')`, [
        newId(),
        mine.houseId,
      ])
      expect(
        await refused(db, `insert into contacts (id, house_id, name) values ($1, $2, 'Plumber')`, [
          newId(),
          theirs.houseId,
        ]),
      ).toBe(INSUFFICIENT_PRIVILEGE)
      // Updating another house's rows silently matches nothing.
      const r = await db.query(`update contacts set name = 'Hacked' where house_id = $1`, [
        theirs.houseId,
      ])
      expect(r.rowCount).toBe(0)
    })
  })

  it("only admins create invites or change members; nobody edits someone else's profile", async () => {
    await asUser(mine.member, async (db) => {
      expect(
        await refused(
          db,
          `insert into house_invites (id, house_id, token_hash, created_by, expires_at, max_uses)
           values ($1, $2, 'x', $3, now(), 1)`,
          [newId(), mine.houseId, mine.member],
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE)
      // Their own row is theirs to update, but not their role.
      expect(
        await refused(db, `update house_members set role = 'admin' where user_id = $1`, [
          mine.member,
        ]),
      ).toBe(INSUFFICIENT_PRIVILEGE)
      const rename = await db.query(`update profiles set display_name = 'Not you' where id = $1`, [
        mine.admin,
      ])
      expect(rename.rowCount).toBe(0)
    })
    await asUser(mine.admin, async (db) => {
      await db.query(
        `insert into house_invites (id, house_id, token_hash, created_by, expires_at, max_uses)
         values ($1, $2, $3, $4, now(), 1)`,
        [newId(), mine.houseId, `admin-${newId()}`, mine.admin],
      )
    })
  })

  it('a member records activity only in their own name, in their own house', async () => {
    await asUser(mine.member, async (db) => {
      const insert = `insert into activity_events (house_id, actor_id, action_id, kind) values ($1, $2, $3, 'house.created')`
      await db.query(insert, [mine.houseId, mine.member, newId()])
      expect(await refused(db, insert, [mine.houseId, mine.admin, newId()])).toBe(
        INSUFFICIENT_PRIVILEGE,
      )
      expect(await refused(db, insert, [mine.houseId, null, newId()])).toBe(INSUFFICIENT_PRIVILEGE)
      expect(await refused(db, insert, [theirs.houseId, mine.member, newId()])).toBe(
        INSUFFICIENT_PRIVILEGE,
      )
    })
  })

  it('a second house can only be set up while none exists', async () => {
    const newcomer = newId()
    await asOwner((db) =>
      db.query(`insert into profiles (id, display_name) values ($1, 'New')`, [newcomer]),
    )
    await asUser(newcomer, async (db) => {
      expect(
        await refused(
          db,
          `insert into houses (id, name, created_by, settings) values ($1, 'Another', $2, $3)`,
          [newId(), newcomer, { timezone: 'UTC', feeling_weights: {}, invite_ttl_days: 7 }],
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE)
    })
  })
})

describe('changing your own membership', () => {
  it('a member can move themselves out, but not make themselves an admin', async () => {
    const h = await aDbHouse()
    await asUser(h.member, async (db) => {
      const promote = await refused(
        db,
        `update house_members set role = 'admin' where house_id = $1 and user_id = $2`,
        [h.houseId, h.member],
      )
      expect(promote).toBe(INSUFFICIENT_PRIVILEGE)
      const out = await db.query(
        `update house_members set status = 'moved_out', left_at = now() where house_id = $1 and user_id = $2`,
        [h.houseId, h.member],
      )
      expect(out.rowCount).toBe(1)
    })
  })

  it("someone who moved out can't let themselves back in, and reads nothing", async () => {
    const h = await aDbHouse()
    await asOwner((db) =>
      db.query(
        `update house_members set status = 'moved_out', left_at = now() where house_id = $1 and user_id = $2`,
        [h.houseId, h.member],
      ),
    )
    await asUser(h.member, async (db) => {
      const back = await db.query(
        `update house_members set status = 'active', left_at = null where house_id = $1 and user_id = $2`,
        [h.houseId, h.member],
      )
      expect(back.rowCount).toBe(0)
      expect(await countIn(db, 'contacts', 'house_id', h.houseId)).toBe(0)
      expect(await countIn(db, 'activity_events', 'house_id', h.houseId)).toBe(0)
    })
  })

  it('an admin removing a member cuts off their access', async () => {
    const h = await aDbHouse()
    await asUserCommitted(h.admin, (db) =>
      db.query(
        `update house_members set status = 'moved_out', left_at = now() where house_id = $1 and user_id = $2`,
        [h.houseId, h.member],
      ),
    )
    await asUser(h.member, async (db) => {
      for (const [table, col] of HOUSE_TABLES.filter(
        ([t]) => t !== 'house_members' && t !== 'notifications_outbox',
      )) {
        expect({ table, n: await countIn(db, table, col, h.houseId) }).toEqual({ table, n: 0 })
      }
    })
  })
})

describe('feeling weights (any member) vs. the rest of the house (admins)', () => {
  const setAnxious = `update houses set settings = jsonb_set(settings, '{feeling_weights,anxious}', $2::jsonb) where id = $1`

  it('a member who is not an admin can change the weights, and only the weights', async () => {
    await asUser(mine.member, async (db) => {
      expect((await db.query(setAnxious, [mine.houseId, '40'])).rowCount).toBe(1)
      expect(
        await refused(db, `update houses set name = 'Mine now' where id = $1`, [mine.houseId]),
      ).toBe(INSUFFICIENT_PRIVILEGE)
      expect(
        await refused(
          db,
          `update houses set settings = jsonb_set(settings, '{timezone}', '"UTC"') where id = $1`,
          [mine.houseId],
        ),
      ).toBe(INSUFFICIENT_PRIVILEGE)
    })
    await asUser(mine.admin, async (db) => {
      expect(
        (await db.query(`update houses set name = 'Ours' where id = $1`, [mine.houseId])).rowCount,
      ).toBe(1)
    })
  })

  it("nobody changes another house's weights", async () => {
    await asUser(mine.member, async (db) => {
      expect((await db.query(setAnxious, [theirs.houseId, '40'])).rowCount).toBe(0)
    })
  })

  it('weights stay between -20 and +40, in steps of 5', async () => {
    await asUser(mine.member, async (db) => {
      for (const w of ['45', '-25', '12', '"high"']) {
        expect({ w, code: await refused(db, setAnxious, [mine.houseId, w]) }).toEqual({
          w,
          code: '23514',
        })
      }
    })
  })
})

describe('activity is append-only', () => {
  it('members cannot update or delete activity rows', async () => {
    await asUser(mine.member, async (db) => {
      expect(
        await refused(db, `update activity_events set note = 'rewritten' where house_id = $1`, [
          mine.houseId,
        ]),
      ).toBe(INSUFFICIENT_PRIVILEGE)
      expect(
        await refused(db, `delete from activity_events where house_id = $1`, [mine.houseId]),
      ).toBe(INSUFFICIENT_PRIVILEGE)
    })
  })

  it('the service role cannot rewrite history either', async () => {
    const db = await pool.connect()
    try {
      await db.query('begin')
      await db.query('set local role service_role')
      expect(
        await refused(db, `update activity_events set note = 'x' where house_id = $1`, [
          mine.houseId,
        ]),
      ).toBe(INSUFFICIENT_PRIVILEGE)
      expect(
        await refused(db, `delete from activity_events where house_id = $1`, [mine.houseId]),
      ).toBe(INSUFFICIENT_PRIVILEGE)
    } finally {
      await db.query('rollback')
      db.release()
    }
  })
})

describe('constraints', () => {
  it('activity rows need the subject their kind names', async () => {
    await asOwner(async (db) => {
      const add = (kind: string, col = 'note', val: string | null = null) =>
        refused(
          db,
          `insert into activity_events (house_id, action_id, kind, ${col}) values ($1, $2, $3, $4)`,
          [mine.houseId, newId(), kind, val],
        )
      const CHECK = '23514'
      expect(await add('item.created')).toBe(CHECK) // no item_id
      expect(await add('member.joined')).toBe(CHECK) // no member_id
      expect(await add('not.a.kind')).toBe(CHECK)
      expect(await add('run.item_moved', 'item_id', newId())).toBe(CHECK) // no run_id / to_run_id
    })
  })

  it("a member's room must be in the same house", async () => {
    await asOwner(async (db) => {
      expect(
        await refused(
          db,
          `update house_members set room_id = $1 where house_id = $2 and user_id = $3`,
          [theirs.roomId, mine.houseId, mine.member],
        ),
      ).toBe('23503')
    })
  })
})

describe('server-only tables (rate_limits, security_events)', () => {
  const SERVER_ONLY = ['rate_limits', 'security_events'] as const
  const insertInto = {
    rate_limits: `insert into rate_limits (key, window_start, hits) values ('x', now(), 1)`,
    security_events: `insert into security_events (at, kind, ip, detail)
                      values (now(), 'invite_refused', '203.0.113.7', '{"step":"join.start"}')`,
  }

  it('members, even admins, and signed-out visitors can neither read nor write them', async () => {
    for (const user of [mine.admin, mine.member]) {
      await asUser(user, async (db) => {
        for (const table of SERVER_ONLY) {
          expect({ table, read: await refused(db, `select 1 from ${table} limit 1`) }).toEqual({
            table,
            read: INSUFFICIENT_PRIVILEGE,
          })
          expect({ table, write: await refused(db, insertInto[table]) }).toEqual({
            table,
            write: INSUFFICIENT_PRIVILEGE,
          })
        }
      })
    }
    await asAnon(async (db) => {
      for (const table of SERVER_ONLY) {
        expect({ table, read: await refused(db, `select 1 from ${table} limit 1`) }).toEqual({
          table,
          read: INSUFFICIENT_PRIVILEGE,
        })
        expect({ table, write: await refused(db, insertInto[table]) }).toEqual({
          table,
          write: INSUFFICIENT_PRIVILEGE,
        })
      }
    })
  })

  it('the server (service role) appends security events and reads them back, never edits them', async () => {
    const db = await pool.connect()
    try {
      await db.query('begin')
      await db.query('set local role service_role')
      await db.query(insertInto.security_events)
      const { rows } = await db.query(
        `select kind, ip, detail from security_events where ip = '203.0.113.7' order by id desc limit 1`,
      )
      expect(rows).toEqual([
        { kind: 'invite_refused', ip: '203.0.113.7', detail: { step: 'join.start' } },
      ])
      expect(await refused(db, `update security_events set ip = 'x'`)).toBe(INSUFFICIENT_PRIVILEGE)
      expect(
        await refused(
          db,
          `insert into security_events (at, kind, ip) values (now(), 'something_else', 'x')`,
        ),
      ).toBe('23514')
    } finally {
      await db.query('rollback')
      db.release()
    }
  })
})

describe('costs: edit and remove (T57)', () => {
  const addCost = (db: import('../../lib/testing/db').Db, id: string, by: string) =>
    db.query(
      `insert into costs (id, house_id, amount_cents, paid_by, note, created_by) values ($1, $2, 4250, $3, 'Groceries', $3)`,
      [id, mine.houseId, by],
    )

  it('a member edits the amount, who paid and the note, and sets removed_at', async () => {
    const id = newId()
    await asUser(mine.member, async (db) => {
      await addCost(db, id, mine.member)
      const r = await db.query(
        `update costs set amount_cents = 5000, paid_by = $2, note = null, removed_at = now() where id = $1`,
        [id, mine.admin],
      )
      expect(r.rowCount).toBe(1)
      const { rows } = await db.query(
        `select amount_cents, paid_by, note, removed_at is not null as removed from costs where id = $1`,
        [id],
      )
      expect(rows).toEqual([{ amount_cents: 5000, paid_by: mine.admin, note: null, removed: true }])
    })
  })

  it('what it was for, who added it and when never change; amounts stay in range', async () => {
    const id = newId()
    await asUser(mine.member, async (db) => {
      await addCost(db, id, mine.member)
      for (const set of [
        `created_by = '${mine.admin}'`,
        `created_at = now()`,
        `house_id = '${theirs.houseId}'`,
        `run_id = null`,
      ]) {
        expect({
          set,
          code: await refused(db, `update costs set ${set} where id = $1`, [id]),
        }).toEqual({ set, code: INSUFFICIENT_PRIVILEGE })
      }
      expect(await refused(db, `update costs set amount_cents = 0 where id = $1`, [id])).toBe(
        '23514',
      )
    })
  })

  it("someone outside the house can't edit or remove a cost", async () => {
    const id = newId()
    await asOwner((db) => addCost(db, id, mine.member))
    try {
      await asUser(theirs.member, async (db) => {
        const r = await db.query(
          `update costs set amount_cents = 1, removed_at = now() where id = $1`,
          [id],
        )
        expect(r.rowCount).toBe(0)
      })
      const { rows } = await asOwner((db) =>
        db.query(`select amount_cents, removed_at from costs where id = $1`, [id]),
      )
      expect(rows).toEqual([{ amount_cents: 4250, removed_at: null }])
    } finally {
      await asOwner((db) => db.query(`delete from costs where id = $1`, [id]))
    }
  })
})
