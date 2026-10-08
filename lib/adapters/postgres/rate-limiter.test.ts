import { afterAll } from 'vitest'
import { rateLimiterContract } from '../contracts/rate-limiter.contract'
import { postgresRateLimiter } from './rate-limiter'
import { createDb } from './unit-of-work'

const db = createDb(
  process.env.TEST_APP_DATABASE_URL ??
    'postgresql://app_server:app-server-local-only@127.0.0.1:54322/postgres',
  2,
)
afterAll(() => db.destroy())

rateLimiterContract('postgres', () => postgresRateLimiter(db))
