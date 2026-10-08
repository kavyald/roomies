// Server-only writes (DEPLOYMENT D9, ARCHITECTURE §5.2, A30). The grant guard: the browser's role
// (`authenticated`) holds no write on any table, the server's `app_writer` holds exactly the
// writes members need, and only `app_server` can switch to it. A new table must grant its writes
// to `app_writer` (and add them to APP_WRITER below), never to `authenticated`.

import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  aDbHouse,
  asBrowser,
  asOwner,
  asUser,
  newId,
  pool,
  refused,
  type TestHouse,
} from '../../lib/testing/db'
import { mintJwt } from '../../lib/testing/jwt'

const INSUFFICIENT_PRIVILEGE = '42501'
const API_URL = process.env.TEST_SUPABASE_URL ?? 'http://127.0.0.1:54321'

// Table-level writes `app_writer` holds, per table.
const APP_WRITER: Record<string, string[]> = {
  activity_events: ['INSERT'],
  contacts: ['INSERT', 'UPDATE'],
  costs: ['INSERT'],
  feelings: ['DELETE', 'INSERT', 'UPDATE'],
  house_invites: ['INSERT', 'UPDATE'],
  house_members: ['INSERT', 'UPDATE'],
  houses: ['INSERT', 'UPDATE'],
  items: ['INSERT', 'UPDATE'],
  notification_prefs: ['INSERT', 'UPDATE'],
  notifications_outbox: ['INSERT'],
  poll_options: ['INSERT', 'UPDATE'],
  poll_votes: ['DELETE', 'INSERT', 'UPDATE'],
  polls: ['INSERT', 'UPDATE'],
  profiles: ['INSERT', 'UPDATE'],
  push_subscriptions: ['INSERT', 'UPDATE'],
  rooms: ['INSERT', 'UPDATE'],
  runs: ['INSERT', 'UPDATE'],
}

const WRITES = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'MAINTAIN']

let h: TestHouse

beforeAll(async () => {
  h = await aDbHouse()
})

afterAll(() => pool.end())

describe('grant guard', () => {
  it('authenticated holds no write on any table, column or sequence in public', async () => {
    const { rows } = await asOwner((db) =>
      db.query<{ name: string; priv: string }>(
        `select c.relname as name, p.priv
         from pg_class c
         cross join unnest($1::text[]) as p(priv)
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
           and (has_table_privilege('authenticated', c.oid, p.priv)
             or (p.priv in ('INSERT', 'UPDATE')
                 and has_any_column_privilege('authenticated', c.oid, p.priv)))
         union all
         select c.relname, p.priv
         from pg_class c
         cross join unnest(array['USAGE', 'UPDATE']) as p(priv)
         where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
           and has_sequence_privilege('authenticated', c.oid, p.priv)`,
        [WRITES],
      ),
    )
    expect(rows).toEqual([])
  })

  it('tables created later give authenticated no writes either (default privileges)', async () => {
    const { rows } = await asOwner((db) =>
      db.query<{ priv: string }>(
        `select a.privilege_type as priv
         from pg_default_acl d, aclexplode(d.defaclacl) a
         where d.defaclnamespace = 'public'::regnamespace
           and d.defaclrole = 'postgres'::regrole and d.defaclobjtype in ('r', 'S')
           and a.grantee = 'authenticated'::regrole
           and a.privilege_type not in ('SELECT', 'REFERENCES')`,
      ),
    )
    expect(rows).toEqual([])
  })

  it('app_writer holds exactly the writes members need', async () => {
    const { rows } = await asOwner((db) =>
      db.query<{ name: string; privs: string[] }>(
        `select table_name as name, array_agg(privilege_type::text order by privilege_type) as privs
         from information_schema.role_table_grants
         where table_schema = 'public' and grantee = 'app_writer' and privilege_type <> 'SELECT'
         group by table_name`,
      ),
    )
    expect(Object.fromEntries(rows.map((r) => [r.name, r.privs]))).toEqual(APP_WRITER)

    const columns = await asOwner((db) =>
      db.query<{ name: string; col: string }>(
        `select table_name as name, column_name as col
         from information_schema.column_privileges
         where table_schema = 'public' and grantee = 'app_writer' and privilege_type = 'UPDATE'
           and not (table_name = any($1::text[]))
         order by 1, 2`,
        [Object.keys(APP_WRITER).filter((t) => APP_WRITER[t]!.includes('UPDATE'))],
      ),
    )
    expect(columns.rows).toEqual(
      ['amount_cents', 'note', 'paid_by', 'removed_at'].map((col) => ({ name: 'costs', col })),
    )
  })

  it('only app_server can become app_writer; it has no login and no way in from a JWT', async () => {
    const { rows } = await asOwner((db) =>
      db.query(
        `select r.rolcanlogin as login,
                pg_has_role('app_server', 'app_writer', 'SET') as server,
                pg_has_role('authenticator', 'app_writer', 'MEMBER') as authenticator,
                pg_has_role('authenticated', 'app_writer', 'MEMBER') as authenticated,
                pg_has_role('anon', 'app_writer', 'MEMBER') as anon,
                pg_has_role('app_writer', 'authenticated', 'USAGE') as reads_like_members
         from pg_roles r where r.rolname = 'app_writer'`,
      ),
    )
    expect(rows[0]).toEqual({
      login: false,
      server: true,
      authenticator: false,
      authenticated: false,
      anon: false,
      reads_like_members: true,
    })
  })

  it('Realtime publishes only activity_events', async () => {
    const { rows } = await asOwner((db) =>
      db.query(
        `select schemaname || '.' || tablename as t from pg_publication_tables
         where pubname = 'supabase_realtime' order by 1`,
      ),
    )
    expect(rows.map((r) => r.t)).toEqual(['public.activity_events'])
  })

  it('no security-definer helper is left in public (they live in private)', async () => {
    const { rows } = await asOwner((db) =>
      db.query(
        `select proname from pg_proc
         where pronamespace = 'public'::regnamespace and prosecdef order by 1`,
      ),
    )
    expect(rows).toEqual([])
  })
})

describe('the browser role reads but cannot write', () => {
  it('reads its house under RLS', async () => {
    await asBrowser(h.member, async (db) => {
      const { rows } = await db.query('select id from houses')
      expect(rows.map((r) => r.id)).toEqual([h.houseId])
    })
  })

  it('every kind of write is refused', async () => {
    await asBrowser(h.member, async (db) => {
      const attempts: [string, unknown[]][] = [
        [`update houses set name = 'Mine now' where id = $1`, [h.houseId]],
        [
          `insert into rooms (id, house_id, name, floor, kind) values ($1, $2, 'Den', 'first', 'common')`,
          [newId(), h.houseId],
        ],
        [`update house_members set room_id = null where user_id = $1`, [h.member]],
        [
          `insert into activity_events (house_id, actor_id, kind) values ($1, $2, 'house.created')`,
          [h.houseId, h.member],
        ],
        [`delete from feelings where house_id = $1`, [h.houseId]],
        [`delete from poll_votes where house_id = $1`, [h.houseId]],
        [`update costs set note = 'x' where house_id = $1`, [h.houseId]],
        [`update profiles set display_name = 'Someone' where id = $1`, [h.member]],
      ]
      for (const [sql, params] of attempts) {
        expect({ sql, code: await refused(db, sql, params) }).toEqual({
          sql,
          code: INSUFFICIENT_PRIVILEGE,
        })
      }
    })
  })

  it('the same member writes through the server role', async () => {
    await asUser(h.member, async (db) => {
      const r = await db.query(`update profiles set display_name = 'Wren B' where id = $1`, [
        h.member,
      ])
      expect(r.rowCount).toBe(1)
    })
  })
})

describe('the REST API with a signed-in user token', () => {
  const rest = () =>
    createClient(API_URL, mintJwt({ role: 'anon', aud: undefined }), {
      accessToken: async () => mintJwt({ sub: h.member, role: 'authenticated' }),
      auth: { persistSession: false },
    })

  it('reads the house', async () => {
    const { data, error } = await rest().from('houses').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([{ id: h.houseId }])
  })

  it('refuses inserts, updates and deletes', async () => {
    const sb = rest()
    const insert = await sb
      .from('rooms')
      .insert({ id: newId(), house_id: h.houseId, name: 'Den', floor: 'first', kind: 'common' })
    const update = await sb.from('houses').update({ name: 'Mine now' }).eq('id', h.houseId)
    const remove = await sb.from('feelings').delete().eq('house_id', h.houseId)
    expect([insert.error?.code, update.error?.code, remove.error?.code]).toEqual([
      INSUFFICIENT_PRIVILEGE,
      INSUFFICIENT_PRIVILEGE,
      INSUFFICIENT_PRIVILEGE,
    ])
    const { rows } = await asOwner((db) =>
      db.query('select name from houses where id = $1', [h.houseId]),
    )
    expect(rows[0].name).toBe('The apartment')
  })

  it("can't call the policy helpers as RPCs", async () => {
    const sb = rest()
    const member = await sb.rpc('is_member', { h: h.houseId })
    const setup = await sb.rpc('no_house_exists')
    expect(member.error).not.toBeNull()
    expect(setup.error).not.toBeNull()
    expect([member.data, setup.data]).toEqual([null, null])
  })
})
