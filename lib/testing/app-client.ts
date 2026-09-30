// A fake AppClient over the in-memory adapters, for component tests (ARCHITECTURE §4.1).

import { memoryChangeFeed, memoryHouseQueries } from '../adapters/memory/queries'
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
  changes: memoryChangeFeed(uow, actor),
  vapidPublicKey: 'test-vapid-key',
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
    startRun: async () => err('unexpected'),
    addToRun: async () => err('unexpected'),
    markRunItemsDone: async () => err('unexpected'),
    moveRunItems: async () => err('unexpected'),
    returnToPool: async () => err('unexpected'),
    finishRun: async () => err('unexpected'),
    startRequest: async () => err('unexpected'),
    planVisit: async () => err('unexpected'),
    addToRequest: async () => err('unexpected'),
    sendRequest: async () => err('unexpected'),
    handToContact: async () => err('unexpected'),
    moveToNewVisit: async () => err('unexpected'),
    setVisitDate: async () => err('unexpected'),
    createPoll: async () => err('unexpected'),
    vote: async () => err('unexpected'),
    addPollOption: async () => err('unexpected'),
    closePoll: async () => err('unexpected'),
    addCost: async () => err('unexpected'),
    copiedToSplitwise: async () => err('unexpected'),
    savePushSubscription: async () => err('unexpected'),
    updateMySettings: async () => err('unexpected'),
    setNotificationEnabled: async () => err('unexpected'),
    ...commands,
  },
})
