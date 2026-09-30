// The job schedule (T32): pg_cron calls /api/cron/tick every 15 minutes, with the URL and secret
// from Vault, and quietly does nothing until both are set.
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '../../lib/testing/db'

afterAll(() => pool.end())

/** Runs `fn` in a transaction that's always rolled back. */
const rolledBack = async <T>(fn: (db: import('pg').PoolClient) => Promise<T>): Promise<T> => {
  const db = await pool.connect()
  try {
    await db.query('begin')
    return await fn(db)
  } finally {
    await db.query('rollback')
    db.release()
  }
}

describe('scheduled jobs', () => {
  it('the tick runs every 15 minutes and reads its URL and secret from Vault', async () => {
    const { rows } = await pool.query(
      `select schedule, active, command from cron.job where jobname = 'roomies-tick'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ schedule: '*/15 * * * *', active: true })
    expect(rows[0].command).toContain("'roomies_app_url'")
    expect(rows[0].command).toContain("'roomies_cron_secret'")
    expect(rows[0].command).toContain("'x-cron-secret'")
  })

  it('sends notifications every 5 minutes, reminds every 15, and closes due polls hourly', async () => {
    const { rows } = await pool.query(
      `select jobname, schedule from cron.job where jobname like 'roomies-%' order by jobname`,
    )
    expect(rows).toEqual([
      { jobname: 'roomies-close-polls', schedule: '5 * * * *' },
      { jobname: 'roomies-reminders', schedule: '*/15 * * * *' },
      { jobname: 'roomies-send-notifications', schedule: '*/5 * * * *' },
      { jobname: 'roomies-tick', schedule: '*/15 * * * *' },
    ])
    const commands = await pool.query(
      `select jobname, command from cron.job where jobname like 'roomies-%'`,
    )
    for (const r of commands.rows) {
      const path = r.jobname.replace('roomies-', '')
      expect({ job: r.jobname, calls: r.command.includes(`/api/cron/${path}'`) }).toEqual({
        job: r.jobname,
        calls: true,
      })
    }
  })

  it('does nothing until both secrets are set', async () => {
    await rolledBack(async (db) => {
      await db.query(
        `delete from vault.secrets where name in ('roomies_app_url', 'roomies_cron_secret')`,
      )
      const { rows } = await db.query(`select command from cron.job where jobname = 'roomies-tick'`)
      const sent = await db.query(rows[0].command)
      expect(sent.rowCount).toBe(0) // no net.http_post call was made
      await db.query(`select vault.create_secret('http://example.invalid', 'roomies_app_url')`)
      expect((await db.query(rows[0].command)).rowCount).toBe(0)
      await db.query(`select vault.create_secret('${'s'.repeat(32)}', 'roomies_cron_secret')`)
      expect((await db.query(rows[0].command)).rowCount).toBe(1) // queued (rolled back below)
    })
  })
})
