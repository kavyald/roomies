// Postgres UnitOfWork (ARCHITECTURE §4.1). Connects as `app_server`, which can do nothing by
// itself; each transaction switches role so the database enforces access:
//   member → `set local role app_writer` + their JWT claims (RLS applies, auth.uid() = them;
//            app_writer is `authenticated` plus the write grants the browser doesn't have, A30)
//   system → `set local role service_role` (jobs; bypasses RLS)
// All session state is transaction-local, so this works through a transaction pooler.

import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import pg from 'pg'
import {
  AccessDenied,
  Conflict,
  ConstraintViolation,
  type Repos,
  type UnitOfWork,
} from '../../app/ports'
import type { HouseId, UserId } from '../../domain/ids'
import type { Need, Version } from '../../domain/items'
import type { NotificationCategory } from '../../domain/notifications'
import type { Actor } from '../../domain/actor'
import { activityRowFor } from '../../domain/events'
import { isFailedResult } from '../../domain/result'
import {
  activityToDomain,
  contactToDomain,
  contactToRow,
  costChangesToRow,
  costToDomain,
  costToRow,
  houseToDomain,
  houseToRow,
  inviteToDomain,
  inviteToRow,
  feelingToDomain,
  feelingToRow,
  itemToDomain,
  itemToRow,
  memberToDomain,
  memberToRow,
  profileToDomain,
  profileToRow,
  roomToDomain,
  pollOptionToRow,
  pollToDomain,
  roomToRow,
  runToDomain,
  runToRow,
  toDate,
  toInstant,
} from './mappers'
import type { DB } from './schema'

type Trx = Transaction<DB>

export const createDb = (connectionString: string, max = 5): Kysely<DB> =>
  new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max }) }),
  })

const INSUFFICIENT_PRIVILEGE = '42501'
const UNIQUE_VIOLATION = '23505'
const CHECK_VIOLATION = '23514'
const FOREIGN_KEY_VIOLATION = '23503'

type PgError = { code?: string; constraint?: string; message?: string }

/**
 * Updates the row if this actor can see it, and inserts it otherwise. A plain upsert
 * (`insert … on conflict do update`) also applies SELECT policies to the new row, which would
 * block legitimate first writes such as setting up the house before you're its member.
 * A primary-key clash on the insert means the row exists but isn't yours to change.
 */
const save = async (
  update: () => Promise<{ numUpdatedRows: bigint }>,
  insert: () => Promise<unknown>,
): Promise<void> => {
  const { numUpdatedRows } = await update()
  if (numUpdatedRows > BigInt(0)) return
  try {
    await insert()
  } catch (e) {
    const pe = e as PgError
    if (pe.code === UNIQUE_VIOLATION && pe.constraint?.endsWith('_pkey')) {
      throw new AccessDenied(`Not allowed to change this row (${pe.constraint})`)
    }
    throw e
  }
}

/**
 * A row's version (`Item.version`, ARCHITECTURE §7.5): its `updated_at` (set by the
 * `touch_updated_at` trigger) in whole microseconds, as text. Exact, unlike a JS Date, so two
 * saves in the same millisecond still differ. `versionOf` reads the same value from PostgREST.
 */
const versionSql = (column: 'items.updated_at' | 'runs.updated_at') =>
  sql<string>`(extract(epoch from ${sql.ref(column)}) * 1000000)::bigint::text`

const reposFor = (trx: Trx): Repos => {
  // Items and runs this transaction has written: it holds their row locks until it ends, so a
  // second save of the same loaded copy (still carrying the version it was loaded at) is no race.
  const written = new Set<string>()
  /**
   * Saves an item or run (ARCHITECTURE §7.5). A loaded copy (`loaded` set) updates only while the
   * stored row is still that version; zero rows then means someone saved it since (`Conflict`)
   * or, if the version still matches, a row this actor can't change (on to the insert, whose key
   * clash is AccessDenied). Under READ COMMITTED a racing writer waits for the first to commit,
   * then re-checks the WHERE against the new row, so exactly one of them wins. A new copy (no
   * version) updates by id or inserts, as every other save does.
   */
  const saveLoaded = async (
    key: string,
    loaded: Version | undefined,
    update: (version: Version | null) => Promise<{ numUpdatedRows: bigint }>,
    stored: () => Promise<{ version: string } | undefined>,
    insert: () => Promise<unknown>,
  ): Promise<void> => {
    const version = loaded && !written.has(key) ? loaded : null
    await save(async () => {
      const r = await update(version)
      if (version && r.numUpdatedRows === BigInt(0)) {
        const now = await stored()
        if (now && now.version !== version)
          throw new Conflict(`${key} was saved by someone else after it was loaded`)
      }
      return r
    }, insert)
    written.add(key)
  }

  // A house's time zone, for reading and writing item dates as local dates (cached per transaction).
  const zones = new Map<string, Promise<string>>()
  const tzOf = (houseId: string): Promise<string> => {
    let z = zones.get(houseId)
    if (!z) {
      z = trx
        .selectFrom('houses')
        .select(sql<string>`settings->>'timezone'`.as('tz'))
        .where('id', '=', houseId)
        .executeTakeFirst()
        .then((r) => r?.tz ?? 'UTC')
      zones.set(houseId, z)
    }
    return z
  }
  const itemsWithZone = () =>
    trx
      .selectFrom('items')
      .innerJoin('houses', 'houses.id', 'items.house_id')
      .selectAll('items')
      .select(versionSql('items.updated_at').as('version'))
      .select(sql<string>`houses.settings->>'timezone'`.as('tz'))
  const runsWithZone = () =>
    trx
      .selectFrom('runs')
      .innerJoin('houses', 'houses.id', 'runs.house_id')
      .selectAll('runs')
      .select(versionSql('runs.updated_at').as('version'))
      .select(sql<string>`houses.settings->>'timezone'`.as('tz'))

  return {
    houses: {
      get: async (id) => {
        const r = await trx.selectFrom('houses').selectAll().where('id', '=', id).executeTakeFirst()
        return r && houseToDomain(r)
      },
      any: async () =>
        (await trx.selectFrom('houses').select('id').limit(1).executeTakeFirst()) !== undefined,
      listAll: async () =>
        (await trx.selectFrom('houses').selectAll().orderBy('created_at').execute()).map(
          houseToDomain,
        ),
      setupAvailable: async () => {
        const { rows } = await sql<{ ok: boolean }>`select private.no_house_exists() as ok`.execute(
          trx,
        )
        return rows[0]?.ok === true
      },
      save: async (house) => {
        const row = houseToRow(house)
        // Never rewrite who made the house or when: the stored time has microseconds a JS Date
        // lacks, and the weights policy compares everything but the weights.
        const { id: _id, created_by: _by, created_at: _at, ...editable } = row
        await save(
          () =>
            trx.updateTable('houses').set(editable).where('id', '=', house.id).executeTakeFirst(),
          () => trx.insertInto('houses').values(row).execute(),
        )
      },
    },
    profiles: {
      get: async (id) => {
        const r = await trx
          .selectFrom('profiles')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirst()
        return r && profileToDomain(r)
      },
      save: async (p) => {
        const row = profileToRow(p)
        await save(
          () => trx.updateTable('profiles').set(row).where('id', '=', p.id).executeTakeFirst(),
          () => trx.insertInto('profiles').values(row).execute(),
        )
      },
    },
    members: {
      get: async (houseId, userId) => {
        const r = await trx
          .selectFrom('house_members')
          .selectAll()
          .where('house_id', '=', houseId)
          .where('user_id', '=', userId)
          .executeTakeFirst()
        return r && memberToDomain(r)
      },
      listByHouse: async (houseId) =>
        (
          await trx
            .selectFrom('house_members')
            .selectAll()
            .where('house_id', '=', houseId)
            .orderBy('joined_at')
            .orderBy('user_id')
            .execute()
        ).map(memberToDomain),
      listForUser: async (userId) =>
        (
          await trx
            .selectFrom('house_members')
            .selectAll()
            .where('user_id', '=', userId)
            .orderBy('joined_at')
            .execute()
        ).map(memberToDomain),
      save: async (m) => {
        const row = memberToRow(m)
        await save(
          () =>
            trx
              .updateTable('house_members')
              .set(row)
              .where('house_id', '=', m.houseId)
              .where('user_id', '=', m.userId)
              .executeTakeFirst(),
          () => trx.insertInto('house_members').values(row).execute(),
        )
      },
    },
    rooms: {
      get: async (id) => {
        const r = await trx.selectFrom('rooms').selectAll().where('id', '=', id).executeTakeFirst()
        return r && roomToDomain(r)
      },
      listByHouse: async (houseId) =>
        (
          await trx
            .selectFrom('rooms')
            .selectAll()
            .where('house_id', '=', houseId)
            .orderBy('sort_order')
            .orderBy('name')
            .execute()
        ).map(roomToDomain),
      save: async (room) => {
        const row = roomToRow(room)
        await save(
          () => trx.updateTable('rooms').set(row).where('id', '=', room.id).executeTakeFirst(),
          () => trx.insertInto('rooms').values(row).execute(),
        )
      },
    },
    contacts: {
      get: async (id) => {
        const r = await trx
          .selectFrom('contacts')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirst()
        return r && contactToDomain(r)
      },
      listByHouse: async (houseId) =>
        (
          await trx
            .selectFrom('contacts')
            .selectAll()
            .where('house_id', '=', houseId)
            .orderBy(sql`lower(name)`)
            .execute()
        ).map(contactToDomain),
      save: async (c) => {
        const row = contactToRow(c)
        await save(
          () => trx.updateTable('contacts').set(row).where('id', '=', c.id).executeTakeFirst(),
          () => trx.insertInto('contacts').values(row).execute(),
        )
      },
    },
    invites: {
      get: async (id) => {
        const r = await trx
          .selectFrom('house_invites')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirst()
        return r && inviteToDomain(r)
      },
      findByTokenHash: async (hash) => {
        const r = await trx
          .selectFrom('house_invites')
          .selectAll()
          .where('token_hash', '=', hash)
          .executeTakeFirst()
        return r && inviteToDomain(r)
      },
      listByHouse: async (houseId) =>
        (
          await trx
            .selectFrom('house_invites')
            .selectAll()
            .where('house_id', '=', houseId)
            .execute()
        ).map(inviteToDomain),
      save: async (i) => {
        const row = inviteToRow(i)
        await save(
          () => trx.updateTable('house_invites').set(row).where('id', '=', i.id).executeTakeFirst(),
          () => trx.insertInto('house_invites').values(row).execute(),
        )
      },
    },
    items: {
      get: async (id) => {
        const r = await itemsWithZone().where('items.id', '=', id).executeTakeFirst()
        return r && itemToDomain(r, r.tz)
      },
      listByHouse: async (houseId) =>
        (
          await itemsWithZone()
            .where('items.house_id', '=', houseId)
            .orderBy('items.created_at')
            .execute()
        ).map((r) => itemToDomain(r, r.tz)),
      openNeeds: async (houseId) =>
        (
          await itemsWithZone()
            .where('items.house_id', '=', houseId)
            .where('items.category', '=', 'need')
            .where('items.done_at', 'is', null)
            .where('items.archived_at', 'is', null)
            .execute()
        ).map((r) => itemToDomain(r, r.tz) as Need),
      onRun: async (runId) =>
        (
          await itemsWithZone()
            .where('items.run_id', '=', runId)
            .orderBy('items.created_at')
            .execute()
        ).map((r) => itemToDomain(r, r.tz)),
      save: async (item) => {
        const row = itemToRow(item, await tzOf(item.houseId))
        const { id: _id, created_by: _by, created_at: _at, ...editable } = row
        await saveLoaded(
          `items/${item.id}`,
          item.version,
          (version) => {
            const q = trx.updateTable('items').set(editable).where('id', '=', item.id)
            return (
              version ? q.where(versionSql('items.updated_at'), '=', version) : q
            ).executeTakeFirst()
          },
          () =>
            trx
              .selectFrom('items')
              .select(versionSql('items.updated_at').as('version'))
              .where('id', '=', item.id)
              .executeTakeFirst(),
          () => trx.insertInto('items').values(row).execute(),
        )
      },
    },
    runs: {
      get: async (id) => {
        const r = await runsWithZone().where('runs.id', '=', id).executeTakeFirst()
        return r && runToDomain(r, r.tz)
      },
      listByHouse: async (houseId) =>
        (
          await runsWithZone()
            .where('runs.house_id', '=', houseId)
            .orderBy('runs.created_at')
            .execute()
        ).map((r) => runToDomain(r, r.tz)),
      save: async (run) => {
        const row = runToRow(run, await tzOf(run.houseId))
        // A run's kind never changes: leave it (and who started it, and when) as stored.
        const { id: _id, kind: _kind, created_by: _by, created_at: _at, ...editable } = row
        await saveLoaded(
          `runs/${run.id}`,
          run.version,
          (version) => {
            const q = trx.updateTable('runs').set(editable).where('id', '=', run.id)
            return (
              version ? q.where(versionSql('runs.updated_at'), '=', version) : q
            ).executeTakeFirst()
          },
          () =>
            trx
              .selectFrom('runs')
              .select(versionSql('runs.updated_at').as('version'))
              .where('id', '=', run.id)
              .executeTakeFirst(),
          () => trx.insertInto('runs').values(row).execute(),
        )
      },
    },
    notifications: {
      offFor: async (userIds) => {
        const off = new Map<UserId, Set<NotificationCategory>>()
        if (userIds.length === 0) return off
        const rows = await trx
          .selectFrom('notification_prefs')
          .select(['user_id', 'category'])
          .where('user_id', 'in', [...userIds])
          .where('enabled', '=', false)
          .execute()
        for (const r of rows) {
          const u = r.user_id as UserId
          off.set(u, new Set([...(off.get(u) ?? []), r.category as NotificationCategory]))
        }
        return off
      },
      setEnabled: async (userId, category, enabled) => {
        await save(
          () =>
            trx
              .updateTable('notification_prefs')
              .set({ enabled })
              .where('user_id', '=', userId)
              .where('category', '=', category)
              .executeTakeFirst(),
          () =>
            trx
              .insertInto('notification_prefs')
              .values({ user_id: userId, category, enabled })
              .execute(),
        )
      },
      enqueue: async (messages) => {
        const row = (m: (typeof messages)[number]) => ({
          user_id: m.userId,
          house_id: m.houseId,
          category: m.category,
          title: m.title,
          body: m.body,
          url: m.url,
          send_after: toDate(m.sendAfter),
          dedupe_key: m.dedupeKey ?? null,
        })
        // ON CONFLICT also applies the SELECT policy ("read own"), so it's used only for reminders,
        // which carry a dedupe key and are written by the system.
        const plain = messages.filter((m) => !m.dedupeKey)
        const keyed = messages.filter((m) => m.dedupeKey)
        let written = 0
        if (plain.length) {
          await trx.insertInto('notifications_outbox').values(plain.map(row)).execute()
          written += plain.length
        }
        if (keyed.length) {
          const r = await trx
            .insertInto('notifications_outbox')
            .values(keyed.map(row))
            .onConflict((oc) =>
              oc.column('dedupe_key').where('dedupe_key', 'is not', null).doNothing(),
            )
            .executeTakeFirst()
          written += Number(r.numInsertedOrUpdatedRows ?? 0)
        }
        return written
      },
      pending: async (now, limit) =>
        (
          await trx
            .selectFrom('notifications_outbox')
            .selectAll()
            .where('sent_at', 'is', null)
            .where('send_after', '<=', toDate(now))
            .orderBy('id')
            .limit(limit)
            .execute()
        ).map((r) => ({
          id: Number(r.id),
          userId: r.user_id as UserId,
          houseId: r.house_id as HouseId,
          category: r.category as NotificationCategory,
          title: r.title,
          body: r.body,
          url: r.url,
          sendAfter: toInstant(r.send_after),
        })),
      markSent: async (id, at, error) => {
        const r = await trx
          .updateTable('notifications_outbox')
          .set({ sent_at: toDate(at), error })
          .where('id', '=', String(id) as never)
          .executeTakeFirst()
        if (Number(r.numUpdatedRows) === 0) throw new AccessDenied('notifications_outbox')
      },
    },
    pushSubscriptions: {
      save: async (sub) => {
        await save(
          () =>
            trx
              .updateTable('push_subscriptions')
              .set({
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
                user_agent: sub.userAgent ?? null,
                gone_at: null,
              })
              .where('endpoint', '=', sub.endpoint)
              .where('user_id', '=', sub.userId)
              .executeTakeFirst(),
          () =>
            trx
              .insertInto('push_subscriptions')
              .values({
                id: sub.id,
                user_id: sub.userId,
                endpoint: sub.endpoint,
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
                user_agent: sub.userAgent ?? null,
                created_at: toDate(sub.createdAt),
              })
              .execute(),
        )
      },
      forUsers: async (userIds) =>
        userIds.length === 0
          ? []
          : (
              await trx
                .selectFrom('push_subscriptions')
                .selectAll()
                .where('user_id', 'in', [...userIds])
                .where('gone_at', 'is', null)
                .execute()
            ).map((r) => ({
              id: r.id,
              userId: r.user_id as UserId,
              endpoint: r.endpoint,
              keys: { p256dh: r.p256dh, auth: r.auth },
              ...(r.user_agent && { userAgent: r.user_agent }),
              createdAt: toInstant(r.created_at),
              ...(r.last_ok_at && { lastOkAt: toInstant(r.last_ok_at) }),
            })),
      markOk: async (id, at) => {
        await trx
          .updateTable('push_subscriptions')
          .set({ last_ok_at: toDate(at) })
          .where('id', '=', id)
          .execute()
      },
      markGone: async (id, at) => {
        await trx
          .updateTable('push_subscriptions')
          .set({ gone_at: toDate(at) })
          .where('id', '=', id)
          .execute()
      },
    },
    costs: {
      get: async (id) => {
        const r = await trx.selectFrom('costs').selectAll().where('id', '=', id).executeTakeFirst()
        return r && costToDomain(r)
      },
      listByHouse: async (houseId) =>
        (
          await trx
            .selectFrom('costs')
            .selectAll()
            .where('house_id', '=', houseId)
            .orderBy('created_at')
            .execute()
        ).map(costToDomain),
      add: async (cost) => {
        await save(
          async () => ({ numUpdatedRows: BigInt(0) }),
          () => trx.insertInto('costs').values(costToRow(cost)).execute(),
        )
      },
      // Only the editable columns: created_at has microseconds a JS Date drops (CLAUDE.md).
      update: async (cost) => {
        await trx
          .updateTable('costs')
          .set(costChangesToRow(cost))
          .where('id', '=', cost.id)
          .execute()
      },
    },
    polls: {
      get: async (id) => {
        const r = await trx.selectFrom('polls').selectAll().where('id', '=', id).executeTakeFirst()
        if (!r) return undefined
        const [options, votes] = await Promise.all([
          trx.selectFrom('poll_options').selectAll().where('poll_id', '=', id).execute(),
          trx.selectFrom('poll_votes').selectAll().where('poll_id', '=', id).execute(),
        ])
        return pollToDomain(r, options, votes)
      },
      listByHouse: async (houseId) => {
        const [polls, options, votes] = await Promise.all([
          trx
            .selectFrom('polls')
            .selectAll()
            .where('house_id', '=', houseId)
            .orderBy('created_at')
            .execute(),
          trx.selectFrom('poll_options').selectAll().where('house_id', '=', houseId).execute(),
          trx.selectFrom('poll_votes').selectAll().where('house_id', '=', houseId).execute(),
        ])
        return polls.map((p) => pollToDomain(p, options, votes))
      },
      create: async (poll) => {
        await save(
          async () => ({ numUpdatedRows: BigInt(0) }),
          () =>
            trx
              .insertInto('polls')
              .values({
                id: poll.id,
                house_id: poll.houseId,
                question: poll.question,
                item_id: poll.itemId ?? null,
                closes_at: poll.closesAt ? toDate(poll.closesAt) : null,
                closed_at: poll.state.open ? null : toDate(poll.state.closedAt),
                created_by: poll.createdBy,
                created_at: toDate(poll.createdAt),
              })
              .execute(),
        )
        if (poll.options.length)
          await trx
            .insertInto('poll_options')
            .values(poll.options.map((o, i) => pollOptionToRow(poll, o, i)))
            .execute()
      },
      addOption: async (poll, option) => {
        const { count } = await trx
          .selectFrom('poll_options')
          .select((e) => e.fn.countAll<string>().as('count'))
          .where('poll_id', '=', poll.id)
          .executeTakeFirstOrThrow()
        await trx
          .insertInto('poll_options')
          .values(pollOptionToRow(poll, option, Number(count)))
          .execute()
      },
      setVote: async (poll, vote) => {
        const row = {
          poll_id: poll.id,
          user_id: vote.user,
          house_id: poll.houseId,
          option_id: vote.option,
          voted_at: toDate(vote.at),
        }
        await save(
          () =>
            trx
              .updateTable('poll_votes')
              .set({ option_id: row.option_id, voted_at: row.voted_at })
              .where('poll_id', '=', poll.id)
              .where('user_id', '=', vote.user)
              .executeTakeFirst(),
          () => trx.insertInto('poll_votes').values(row).execute(),
        )
      },
      removeVote: async (poll, user) => {
        // "poll votes withdraw own while open" deletes nothing when it refuses.
        const r = await trx
          .deleteFrom('poll_votes')
          .where('poll_id', '=', poll.id)
          .where('user_id', '=', user)
          .executeTakeFirst()
        if (Number(r.numDeletedRows) === 0) throw new AccessDenied('poll_votes')
      },
      saveState: async (poll) => {
        const r = await trx
          .updateTable('polls')
          .set({
            closes_at: poll.closesAt ? toDate(poll.closesAt) : null,
            closed_at: poll.state.open ? null : toDate(poll.state.closedAt),
          })
          .where('id', '=', poll.id)
          .executeTakeFirst()
        if (Number(r.numUpdatedRows) === 0) throw new AccessDenied('polls')
      },
    },
    feelings: {
      get: async (itemId, userId) => {
        const r = await trx
          .selectFrom('feelings')
          .selectAll()
          .where('item_id', '=', itemId)
          .where('user_id', '=', userId)
          .executeTakeFirst()
        return r && feelingToDomain(r)
      },
      save: async (houseId, f) => {
        const row = feelingToRow(houseId, f)
        await save(
          () =>
            trx
              .updateTable('feelings')
              .set(row)
              .where('item_id', '=', f.itemId)
              .where('user_id', '=', f.by)
              .executeTakeFirst(),
          () => trx.insertInto('feelings').values(row).execute(),
        )
      },
      remove: async (itemId, userId) => {
        await trx
          .deleteFrom('feelings')
          .where('item_id', '=', itemId)
          .where('user_id', '=', userId)
          .execute()
      },
    },
    events: {
      forRun: async (houseId, runId) =>
        (
          await trx
            .selectFrom('activity_events')
            .selectAll()
            .where('house_id', '=', houseId)
            .where((w) => w.or([w('run_id', '=', runId), w('to_run_id', '=', runId)]))
            .orderBy('id')
            .execute()
        ).map(activityToDomain),
      lastForItem: async (houseId, itemId, kind) => {
        const row = await trx
          .selectFrom('activity_events')
          .selectAll()
          .where('house_id', '=', houseId)
          .where('item_id', '=', itemId)
          .where('kind', '=', kind)
          .orderBy('id', 'desc')
          .limit(1)
          .executeTakeFirst()
        return row && activityToDomain(row)
      },
      record: async (houseId, events, at) => {
        if (events.length === 0) return
        await trx
          .insertInto('activity_events')
          .values(
            events.map((e) => {
              const r = activityRowFor(e, houseId, at)
              return {
                house_id: r.houseId,
                at: toDate(r.at),
                actor_id: r.actorId,
                action_id: r.actionId,
                kind: r.kind,
                item_id: r.itemId ?? null,
                run_id: r.runId ?? null,
                to_run_id: r.toRunId ?? null,
                poll_id: r.pollId ?? null,
                option_id: r.optionId ?? null,
                cost_id: r.costId ?? null,
                contact_id: r.contactId ?? null,
                member_id: r.memberId ?? null,
                room_id: r.roomId ?? null,
                note: r.note ?? null,
                changes: r.changes === undefined ? null : JSON.stringify(r.changes),
                payload: JSON.stringify(r.payload),
              }
            }),
          )
          .execute()
      },
    },
  }
}

/** Carries a failed Result out of Kysely's transaction so it rolls back. */
class RollbackWith {
  constructor(readonly value: unknown) {}
}

export class PostgresUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Kysely<DB>) {}

  run<T>(actor: Actor, fn: (repos: Repos) => Promise<T>): Promise<T> {
    return this.transaction(actor, (trx) => fn(reposFor(trx)))
  }

  /** One transaction as `actor`. Adapter-internal: `run` uses it, and tests probe the session. */
  async transaction<T>(actor: Actor, fn: (trx: Trx) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        if (actor.kind !== 'system') {
          await sql`set local role app_writer`.execute(trx)
          const claims = JSON.stringify({ sub: actor.userId, role: 'authenticated' })
          await sql`select set_config('request.jwt.claims', ${claims}, true)`.execute(trx)
        } else {
          await sql`set local role service_role`.execute(trx)
        }
        const out = await fn(trx)
        if (isFailedResult(out)) throw new RollbackWith(out)
        return out
      })
    } catch (e) {
      if (e instanceof RollbackWith) return e.value as T
      const code = (e as PgError).code
      if (code === INSUFFICIENT_PRIVILEGE) {
        throw new AccessDenied((e as PgError).message ?? 'Not allowed')
      }
      if (code === UNIQUE_VIOLATION || code === CHECK_VIOLATION || code === FOREIGN_KEY_VIOLATION) {
        throw new ConstraintViolation((e as PgError).message ?? 'Constraint violated')
      }
      throw e
    }
  }
}
