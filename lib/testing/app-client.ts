// A fake AppClient over the in-memory adapters, for component tests (ARCHITECTURE §4.1).

import { manualChangeFeed, memoryHouseQueries } from '../adapters/memory/queries'
import { MemoryUnitOfWork } from '../adapters/memory/db'
import type { AppClient, AppCommands } from '../client/app-client'
import type { HouseActor } from '../domain/actor'
import type { UserId } from '../domain/ids'
import { err } from '../domain/result'

export const fakeAppClient = (
  uow: MemoryUnitOfWork,
  actor: HouseActor,
  commands: Partial<AppCommands> = {},
): AppClient => ({
  me: actor.kind === 'member' ? actor.userId : ('system' as UserId),
  queries: memoryHouseQueries(uow, actor),
  changes: manualChangeFeed(),
  commands: {
    createContact: async () => err('unexpected'),
    createInvite: async () => err('unexpected'),
    revokeInvite: async () => err('unexpected'),
    editContact: async () => err('unexpected'),
    removeContact: async () => err('unexpected'),
    moveOut: async () => err('unexpected'),
    setRole: async () => err('unexpected'),
    renameRoom: async () => err('unexpected'),
    moveRoom: async () => err('unexpected'),
    deleteAccount: async () => err('unexpected'),
    createItem: async () => err('unexpected'),
    editItem: async () => err('unexpected'),
    markDone: async () => err('unexpected'),
    reopenItem: async () => err('unexpected'),
    doChore: async () => err('unexpected'),
    archiveItem: async () => err('unexpected'),
    restoreItem: async () => err('unexpected'),
    setFeeling: async () => err('unexpected'),
    setFeelingWeights: async () => err('unexpected'),
    ...commands,
  },
})
