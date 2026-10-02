import { sql, type Kysely } from 'kysely'
import type { SecurityLog } from '../../app/ports'
import type { InviteProblem } from '../../domain/invites'
import type { SecurityEvent, SecurityStep } from '../../domain/security'
import { instant } from '../../domain/time'
import type { DB } from './schema'

type Detail = { step: SecurityStep; reason?: InviteProblem }

const detailOf = (e: SecurityEvent): Detail =>
  e.kind === 'invite_refused' ? { step: e.step, reason: e.reason } : { step: e.step }

/** Appends to `security_events`, in a transaction of its own as the server's system role. */
export const postgresSecurityLog = (db: Kysely<DB>): SecurityLog => ({
  record: async (event) => {
    await db.transaction().execute(async (trx) => {
      await sql`set local role service_role`.execute(trx)
      await sql`
        insert into public.security_events (at, kind, ip, detail)
        values (${new Date(event.at.epochMs)}, ${event.kind}, ${event.ip},
                ${JSON.stringify(detailOf(event))}::jsonb)`.execute(trx)
    })
  },
})

/** Reads the log back, newest last (tests and the owner's own checks; the app never reads it). */
export const readSecurityEvents = async (db: Kysely<DB>, ip: string): Promise<SecurityEvent[]> =>
  db.transaction().execute(async (trx) => {
    await sql`set local role service_role`.execute(trx)
    const { rows } = await sql<{
      at: Date
      kind: SecurityEvent['kind']
      ip: string
      detail: Detail
    }>`select at, kind, ip, detail from public.security_events where ip = ${ip} order by id`.execute(
      trx,
    )
    return rows.map(({ at, kind, ip, detail }) =>
      kind === 'invite_refused'
        ? { kind, reason: detail.reason!, step: detail.step, ip, at: instant(at.getTime()) }
        : { kind, step: detail.step, ip, at: instant(at.getTime()) },
    )
  })
