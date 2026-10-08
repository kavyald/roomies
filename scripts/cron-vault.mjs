// Points a HOSTED project's pg_cron jobs at its app and checks they reach it (E3 for staging, E5 for
// prod; ARCHITECTURE §7.3, DEPLOYMENT §5). `pnpm cron:local` is the local equivalent.
//
//   pnpm cron:vault set     stores APP_URL and CRON_SECRET in the project's Vault
//                           (roomies_app_url, roomies_cron_secret), creating or replacing them
//   pnpm cron:vault check   which Vault names exist, each roomies-* job's last run, the HTTP status
//                           codes pg_net got back in the last 2 hours, and (with APP_URL and
//                           CRON_SECRET set) a tick sent straight to the app
//
// Everything comes from env, so no secret lands in shell history:
//   VAULT_DB_URL  the project's `postgres` connection string (session pooler, port 5432). pg checks
//                 the certificate: add `sslrootcert=<path to the project's CA certificate>` (from
//                 the dashboard's Database settings) to the URL.
//   APP_URL       the site's https URL, no trailing slash (the one CRON_SECRET belongs to)
//   CRON_SECRET   the same value as the Vercel project's CRON_SECRET
// It never prints the connection string, a secret or any row of house data.
import pg from 'pg'

const [command] = process.argv.slice(2)
const { VAULT_DB_URL, APP_URL, CRON_SECRET } = process.env

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

if (command !== 'set' && command !== 'check') fail('Usage: pnpm cron:vault set|check')
if (!VAULT_DB_URL) fail('Set VAULT_DB_URL to the project’s postgres connection string.')
if (APP_URL && !/^https:\/\/[^/]+$/.test(APP_URL)) fail('APP_URL must be https://host, no path.')
if (CRON_SECRET && CRON_SECRET.length < 32) fail('CRON_SECRET must be at least 32 characters.')

const client = new pg.Client({ connectionString: VAULT_DB_URL })
try {
  await client.connect()
} catch (e) {
  fail(`Couldn't connect: ${e instanceof Error ? e.message.replaceAll(VAULT_DB_URL, '<url>') : e}`)
}

try {
  if (command === 'set') {
    if (!APP_URL || !CRON_SECRET) fail('`set` needs APP_URL and CRON_SECRET.')
    for (const [name, value] of [
      ['roomies_app_url', APP_URL],
      ['roomies_cron_secret', CRON_SECRET],
    ]) {
      const updated = await client.query(
        'select vault.update_secret(id, $1) from vault.secrets where name = $2',
        [value, name],
      )
      if (updated.rowCount === 0) await client.query('select vault.create_secret($1, $2)', [value, name])
    }
    console.log(`Vault set: pg_cron will call ${APP_URL}/api/cron/* from its next run.`)
  } else {
    const names = await client.query(
      "select name from vault.secrets where name in ('roomies_app_url', 'roomies_cron_secret') order by name",
    )
    console.log(`Vault: ${names.rows.map((r) => r.name).join(', ') || 'neither secret is set'}`)

    const jobs = await client.query(`
      select j.jobname, j.schedule, j.active, d.status, d.start_time
      from cron.job j
      left join lateral (
        select status, start_time from cron.job_run_details
        where jobid = j.jobid order by start_time desc limit 1
      ) d on true
      where j.jobname like 'roomies-%' order by j.jobname`)
    for (const j of jobs.rows) {
      const last = j.start_time ? `${j.status} at ${j.start_time.toISOString()}` : 'never run'
      console.log(`Job ${j.jobname} (${j.schedule}${j.active ? '' : ', inactive'}): ${last}`)
    }

    const http = await client.query(`
      select coalesce(status_code::text, case when timed_out then 'timed out' else 'error' end) as code,
             count(*)::int as n
      from net._http_response where created > now() - interval '2 hours' group by 1 order by 1`)
    console.log(
      `pg_net responses, last 2 hours: ${http.rows.map((r) => `${r.code} ×${r.n}`).join(', ') || 'none'}`,
    )

    if (APP_URL && CRON_SECRET) {
      const res = await fetch(`${APP_URL}/api/cron/tick`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cron-secret': CRON_SECRET },
        body: '{}',
      })
      console.log(`Tick sent to the app: ${res.status}${res.ok ? ' (the secret matches)' : ''}`)
      if (!res.ok) process.exitCode = 1
    }
  }
} finally {
  await client.end()
}
