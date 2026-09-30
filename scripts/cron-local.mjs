// Points the local pg_cron jobs at a local app: stores its URL (as Docker sees it) and CRON_SECRET
// from .env.local in the local Supabase Vault. Usage: pnpm cron:local [port]  (default 3000).
// Local only; hosted projects set these two Vault secrets in the dashboard (E3).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const port = process.argv[2] ?? '3000'
const env = readFileSync('.env.local', 'utf8')
const cronSecret = env.match(/^CRON_SECRET=(.+)$/m)?.[1]
if (!cronSecret) {
  console.error('No CRON_SECRET in .env.local. Run: pnpm env:local')
  process.exit(1)
}
const appUrl = `http://host.docker.internal:${port}`

// Upsert one Vault secret by name (psql variables, sent on stdin, keep the values out of the SQL).
const sql = `
select vault.update_secret(id, :'value') from vault.secrets where name = :'name';
select vault.create_secret(:'value', :'name') where not exists (select 1 from vault.secrets where name = :'name');
`
for (const [name, value] of [
  ['roomies_app_url', appUrl],
  ['roomies_cron_secret', cronSecret],
]) {
  execFileSync(
    'psql',
    ['-q', '-v', 'ON_ERROR_STOP=1', '-v', `name=${name}`, '-v', `value=${value}`],
    {
      input: sql,
      env: {
        ...process.env,
        PGPASSWORD: 'postgres',
        PGHOST: '127.0.0.1',
        PGPORT: '54322',
        PGUSER: 'postgres',
        PGDATABASE: 'postgres',
      },
      stdio: ['pipe', 'ignore', 'inherit'],
    },
  )
}
console.log(`pg_cron will call ${appUrl}/api/cron/* (every 15 minutes).`)
