import { notificationsContract } from '../contracts/notifications.contract'
import { seqIds } from '../ids'
import { MemoryUnitOfWork } from './db'
import type { UserId } from '../../domain/ids'

notificationsContract('memory', async () => {
  const uow = new MemoryUnitOfWork()
  const ids = seqIds()
  return {
    uow,
    ids,
    createUser: async () => ids.newId<'user'>() as UserId,
    activity: async () => [],
    outbox: async (houseId) =>
      uow.state.outbox
        .filter((m) => m.houseId === houseId)
        .map(({ userId, category, title }) => ({ userId, category, title })),
  }
})
