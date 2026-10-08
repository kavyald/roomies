import { costsContract } from '../contracts/costs.contract'
import { seqIds } from '../ids'
import { MemoryUnitOfWork } from './db'
import type { UserId } from '../../domain/ids'

costsContract('memory', async () => {
  const uow = new MemoryUnitOfWork()
  const ids = seqIds()
  return {
    uow,
    ids,
    createUser: async () => ids.newId<'user'>() as UserId,
    activity: async () => [],
  }
})
