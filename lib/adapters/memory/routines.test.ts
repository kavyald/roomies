import { routinesContract } from '../contracts/routines.contract'
import { seqIds } from '../ids'
import { MemoryUnitOfWork } from './db'
import type { UserId } from '../../domain/ids'

routinesContract('memory', async () => {
  const uow = new MemoryUnitOfWork()
  const ids = seqIds()
  return {
    uow,
    ids,
    createUser: async () => ids.newId<'user'>() as UserId,
    activity: async () => [],
  }
})
