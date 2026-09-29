// Writes .env.local for local development and CI from `supabase status`, unless it already
// exists (pass --force to overwrite). Local values only; never used for hosted projects.
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'

if (existsSync('.env.local') && !process.argv.includes('--force')) {
  console.log('.env.local already exists (use --force to rewrite it).')
  process.exit(0)
}

const status = Object.fromEntries(
  execSync('pnpm -s supabase status -o env', { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)
if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
  console.error("Couldn't read keys from `pnpm supabase status`. Is local Supabase running?")
  process.exit(1)
}

writeFileSync(
  '.env.local',
  `# Local development only (gitignored). Written by scripts/env-local.mjs from supabase status.
DATABASE_URL=postgresql://app_server:app-server-local-only@127.0.0.1:54322/postgres
SUPABASE_URL=${status.API_URL}
SUPABASE_SERVICE_ROLE_KEY=${status.SERVICE_ROLE_KEY}
SETUP_TOKEN=${randomBytes(24).toString('hex')}
NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}
`,
)
console.log('Wrote .env.local')
