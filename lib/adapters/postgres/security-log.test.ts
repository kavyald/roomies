import { afterAll } from 'vitest'
import { securityLogContract } from '../contracts/security-log.contract'
import { postgresSecurityLog, readSecurityEvents } from './security-log'
import { createDb } from './unit-of-work'

const db = createDb(
  process.env.TEST_APP_DATABASE_URL ??
    'postgresql://app_server:app-server-local-only@127.0.0.1:54322/postgres',
  2,
)
afterAll(() => db.destroy())

securityLogContract('postgres', () => ({
  log: postgresSecurityLog(db),
  read: (ip) => readSecurityEvents(db, ip),
}))
