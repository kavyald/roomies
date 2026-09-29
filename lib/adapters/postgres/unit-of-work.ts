// Postgres UnitOfWork (ARCHITECTURE §4.1). Connects as `app_server`, which can do nothing by
// itself; each transaction switches role so the database enforces access:
//   member → `set local role authenticated` + their JWT claims (RLS applies, auth.uid() = them)
//   system → `set local role service_role` (jobs; bypasses RLS)
// All session state is transaction-local, so this works through a transaction pooler.

import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely'
import pg from 'pg'
import { AccessDenied, type Repos, type UnitOfWork } from '../../app/ports'
import type { Actor } from '../../domain/actor'
import { activityRowFor } from '../../domain/events'
import { isFailedResult } from '../../domain/result'
import {
  contactToDomain,
  contactToRow,
  houseToDomain,
  houseToRow,
  inviteToDomain,
  inviteToRow,
  memberToDomain,
  memberToRow,
  profileToDomain,
  profileToRow,
  roomToDomain,
  roomToRow,
  toDate,
} from './mappers'
import type { DB } from './schema'

type Trx = Transaction<DB>

export const createDb = (connectionString: string, max = 5): Kysely<DB> =>
  new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max }) }),
  })

const INSUFFICIENT_PRIVILEGE = '42501'
const UNIQUE_VIOLATION = '23505'

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

const reposFor = (trx: Trx): Repos => ({
  houses: {
    get: async (id) => {
      const r = await trx.selectFrom('houses').selectAll().where('id', '=', id).executeTakeFirst()
      return r && houseToDomain(r)
    },
    any: async () =>
      (await trx.selectFrom('houses').select('id').limit(1).executeTakeFirst()) !== undefined,
    setupAvailable: async () => {
      const { rows } = await sql<{ ok: boolean }>`select public.no_house_exists() as ok`.execute(
        trx,
      )
      return rows[0]?.ok === true
    },
    save: async (house) => {
      const row = houseToRow(house)
      await save(
        () => trx.updateTable('houses').set(row).where('id', '=', house.id).executeTakeFirst(),
        () => trx.insertInto('houses').values(row).execute(),
      )
    },
  },
  profiles: {
    get: async (id) => {
      const r = await trx.selectFrom('profiles').selectAll().where('id', '=', id).executeTakeFirst()
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
      const r = await trx.selectFrom('contacts').selectAll().where('id', '=', id).executeTakeFirst()
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
    save: async (i) => {
      const row = inviteToRow(i)
      await save(
        () => trx.updateTable('house_invites').set(row).where('id', '=', i.id).executeTakeFirst(),
        () => trx.insertInto('house_invites').values(row).execute(),
      )
    },
  },
  events: {
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
})

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
          await sql`set local role authenticated`.execute(trx)
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
      if ((e as PgError).code === INSUFFICIENT_PRIVILEGE) {
        throw new AccessDenied((e as PgError).message ?? 'Not allowed')
      }
      throw e
    }
  }
}
