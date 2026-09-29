// A fake AppClient over the in-memory adapters, for component tests (ARCHITECTURE §4.1).

import { manualChangeFeed, memoryHouseQueries } from '../adapters/memory/queries'
import { MemoryUnitOfWork } from '../adapters/memory/db'
import type { AppClient, AppCommands } from '../client/app-client'
import type { Actor } from '../domain/actor'
import { err } from '../domain/result'

export const fakeAppClient = (
  uow: MemoryUnitOfWork,
  actor: Actor,
  commands: Partial<AppCommands> = {},
): AppClient => ({
  queries: memoryHouseQueries(uow, actor),
  changes: manualChangeFeed(),
  commands: {
    createContact: async () => err('unexpected'),
    ...commands,
  },
})
