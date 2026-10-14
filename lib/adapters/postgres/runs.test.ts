import { afterAll } from 'vitest'
import type { UserId } from '../../domain/ids'
import { runsContract } from '../contracts/runs.contract'
import { cryptoIds } from '../ids'
import { createDb, PostgresUnitOfWork } from './unit-of-work'

const db = createDb(
  process.env.TEST_APP_DATABASE_URL ??
    'postgresql://app_server:app-server-local-only@127.0.0.1:54322/postgres',
  2,
)
afterAll(() => db.destroy())

runsContract('postgres', async () => ({
  uow: new PostgresUnitOfWork(db),
  ids: cryptoIds,
  createUser: async () => cryptoIds.newId<'user'>() as UserId,
  activity: async () => [],
}))
