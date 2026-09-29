// Measures real bytes per activity_events row, by kind (ARCHITECTURE §6.4 estimates ~205 bytes).
// Inserts sample events for a throwaway house inside a transaction, measures, and rolls back.
// Usage: pnpm db:sizing   (needs local Supabase running)

import { randomUUID as id } from 'node:crypto'
import pg from 'pg'

const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const PER_KIND = 2000

const db = new pg.Client({ connectionString: url })
await db.connect()
try {
  await db.query('begin')
  const house = id(), user = id(), other = id(), room = id(), contact = id()
  await db.query(`insert into profiles (id, display_name) values ($1, 'Kavya'), ($2, 'Wren')`, [user, other])
  await db.query(`insert into houses (id, name, created_by, settings) values ($1, 'Sizing', $2, $3)`, [
    house, user, { timezone: 'America/New_York', feeling_weights: {}, invite_ttl_days: 7 },
  ])
  await db.query(`insert into rooms (id, house_id, name, floor, kind) values ($1, $2, 'Kitchen', 'first', 'common')`, [room, house])
  await db.query(`insert into contacts (id, house_id, name) values ($1, $2, 'Super')`, [contact, house])

  // Representative rows: which subject columns are set, plus typical note/changes/payload.
  const samples = {
    'item.created': { item_id: id() },
    'item.edited': { item_id: id(), changes: { title: ['Paper towels', 'Paper towels (2 pack)'] } },
    'chore.done': { item_id: id() },
    'feeling.set': {
      item_id: id(),
      changes: { previous: null, next: { kind: 'anxious', note: 'It keeps dripping', at: '2026-09-29T16:00:00Z' } },
    },
    'poll.voted': { poll_id: id(), option_id: id() },
    'run.item_added': { item_id: id(), run_id: id() },
    'run.item_moved': { item_id: id(), run_id: id(), to_run_id: id(), note: 'Sending a plumber' },
    'request.sent': { run_id: id(), contact_id: contact, payload: { v: 1, via: 'text', message: '1. Leak under the sink\n2. Radiator clanking' } },
    'cost.added': { cost_id: id(), run_id: id(), member_id: other },
    'member.joined': { member_id: other, room_id: room },
  }

  const rows = []
  for (const [kind, s] of Object.entries(samples)) {
    await db.query(
      `insert into activity_events (house_id, actor_id, action_id, kind, item_id, run_id, to_run_id, poll_id,
         option_id, cost_id, contact_id, member_id, room_id, note, changes, payload)
       select $1, $2, gen_random_uuid(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
       from generate_series(1, ${PER_KIND})`,
      [house, user, kind, s.item_id ?? null, s.run_id ?? null, s.to_run_id ?? null, s.poll_id ?? null,
        s.option_id ?? null, s.cost_id ?? null, s.contact_id ?? null, s.member_id ?? null, s.room_id ?? null,
        s.note ?? null, s.changes ?? null, s.payload ?? { v: 1 }],
    )
    const r = await db.query(
      `select round(avg(pg_column_size(e.*))) as row_bytes from activity_events e where house_id = $1 and kind = $2`,
      [house, kind],
    )
    rows.push({ kind, 'row bytes': Number(r.rows[0].row_bytes) })
  }

  await db.query('analyze activity_events')
  const t = await db.query(`
    select pg_relation_size('activity_events') as heap, pg_indexes_size('activity_events') as idx,
           pg_total_relation_size('activity_events') as total, (select count(*) from activity_events) as n`)
  const { heap, idx, total, n } = t.rows[0]
  console.table(rows)
  const perRow = Math.round(Number(total) / Number(n))
  console.log(`${n} rows: heap ${heap} B, indexes ${idx} B, total ${total} B → ${perRow} bytes/row on disk (incl. indexes and page overhead)`)
  console.log(`At 50 events/day for 5 years: ~${((perRow * 50 * 365 * 5) / 1e6).toFixed(1)} MB`)
} finally {
  await db.query('rollback')
  await db.end()
}
