import pg from 'pg'
import { afterAll } from 'vitest'
import type { UserId } from '../../domain/ids'
import { notificationsContract } from '../contracts/notifications.contract'
import { cryptoIds } from '../ids'
import { createDb, PostgresUnitOfWork } from './unit-of-work'

const db = createDb(
  process.env.TEST_APP_DATABASE_URL ??
    'postgresql://app_server:app-server-local-only@127.0.0.1:54322/postgres',
  2,
)
const owner = new pg.Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  max: 1,
})
afterAll(async () => {
  await db.destroy()
  await owner.end()
})

notificationsContract('postgres', async () => ({
  uow: new PostgresUnitOfWork(db),
  ids: cryptoIds,
  createUser: async () => cryptoIds.newId<'user'>() as UserId,
  activity: async () => [],
  outbox: async (houseId) =>
    (
      await owner.query(
        'select user_id, category, title from notifications_outbox where house_id = $1 order by id',
        [houseId],
      )
    ).rows.map((r) => ({ userId: r.user_id, category: r.category, title: r.title })),
}))
