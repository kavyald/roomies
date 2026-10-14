import { sql, type Kysely } from 'kysely'
import type { RateLimiter } from '../../app/ports'
import type { DB } from './schema'

/** Counts in `rate_limits`, in a transaction of its own as the server's system role. */
export const postgresRateLimiter = (db: Kysely<DB>): RateLimiter => ({
  hit: async (key, { limit, windowMs }, now) => {
    const windowStart = new Date(Math.floor(now.epochMs / windowMs) * windowMs)
    const hits = await db.transaction().execute(async (trx) => {
      await sql`set local role service_role`.execute(trx)
      const { rows } = await sql<{ hits: number }>`
        insert into public.rate_limits (key, window_start, hits) values (${key}, ${windowStart}, 1)
        on conflict (key, window_start) do update set hits = rate_limits.hits + 1
        returning hits`.execute(trx)
      return rows[0]!.hits
    })
    return hits <= limit
  },
})
