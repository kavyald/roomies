import { houseQueriesContract } from '../contracts/house-queries.contract'
import { seqIds } from '../ids'
import { MemoryUnitOfWork } from './db'
import { memoryHouseQueries } from './queries'
import type { UserId } from '../../domain/ids'

houseQueriesContract('memory', async () => {
  const uow = new MemoryUnitOfWork()
  const ids = seqIds()
  return {
    uow,
    ids,
    createUser: async () => ids.newId<'user'>() as UserId,
    activity: async () => [],
    queriesFor: (userId, houseId) => memoryHouseQueries(uow, { kind: 'member', userId, houseId }),
  }
})
