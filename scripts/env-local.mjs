// Writes .env.local for local development and CI from `supabase status`, unless it already
// exists (pass --force to overwrite); an existing file only gains keys it's missing. Local values
// only; never used for hosted projects.
import { execSync } from 'node:child_process'
import webpush from 'web-push'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

const secret = () => randomBytes(24).toString('hex')

const vapid = webpush.generateVAPIDKeys()
const vapidSubject = 'mailto:roomies@localhost.test'

// Keys added after a checkout may already have written .env.local.
const LATER_KEYS = {
  CRON_SECRET: secret,
  VAPID_PRIVATE_KEY: () => vapid.privateKey,
  VAPID_SUBJECT: () => vapidSubject,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: () => vapid.publicKey,
}

if (existsSync('.env.local') && !process.argv.includes('--force')) {
  const current = readFileSync('.env.local', 'utf8')
  const missing = Object.entries(LATER_KEYS).filter(
    ([k]) => !new RegExp(`^${k}=.+`, 'm').test(current),
  )
  if (missing.length === 0) {
    console.log('.env.local already exists (use --force to rewrite it).')
    process.exit(0)
  }
  appendFileSync('.env.local', missing.map(([k, make]) => `${k}=${make()}\n`).join(''))
  console.log(`Added ${missing.map(([k]) => k).join(', ')} to .env.local`)
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
SETUP_TOKEN=${secret()}
CRON_SECRET=${secret()}
VAPID_PRIVATE_KEY=${vapid.privateKey}
VAPID_SUBJECT=${vapidSubject}
NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}
`,
)
console.log('Wrote .env.local')
