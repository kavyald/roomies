'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import type { Feeling, FeelingWeights } from '../domain/feelings'
import type { NewContact } from '../domain/contacts'
import type { AppCommands } from './app-client'
import type { ContactId, HouseId, InviteId, ItemId, RunId } from '../domain/ids'
import type { NewItem } from '../domain/items'
import type { NewInvite } from '../domain/invites'
import { useAppClient } from './provider'
import { keys, keysForTable } from './query-keys'

export const useHouse = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.house(houseId), queryFn: () => queries.house(houseId) })
}

export const useMembers = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.members(houseId), queryFn: () => queries.members(houseId) })
}

export const useProfiles = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.profiles(houseId), queryFn: () => queries.profiles(houseId) })
}

export const useRooms = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.rooms(houseId), queryFn: () => queries.rooms(houseId) })
}

export const useContacts = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.contacts(houseId), queryFn: () => queries.contacts(houseId) })
}

export const useInvites = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.invites(houseId), queryFn: () => queries.invites(houseId) })
}

export const useCreateInvite = (houseId: HouseId) => {
  const { commands } = useAppClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewInvite) => commands.createInvite(input),
    onSuccess: (r) => {
      if (r.ok) return qc.invalidateQueries({ queryKey: keys.invites(houseId) })
    },
  })
}

export const useRevokeInvite = (houseId: HouseId) => {
  const { commands } = useAppClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: InviteId) => commands.revokeInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invites(houseId) }),
  })
}

/**
 * A command that refreshes some of the house's queries when it works. Every House-tab change
 * goes through here; the activity log refreshes too, since changes write to it.
 */
/** Query families keyed by the house alone (the ones a command refreshes). */
type HouseKey = Exclude<keyof typeof keys, 'itemActivity' | 'runActivity'>

const useHouseCommand = <I, R extends { ok: boolean }>(
  houseId: HouseId,
  run: (commands: ReturnType<typeof useAppClient>['commands'], input: I) => Promise<R>,
  affects: HouseKey[],
) => {
  const { commands } = useAppClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: I) => run(commands, input),
    onSuccess: (r) => {
      if (!r.ok) return
      return Promise.all(
        [...affects, 'activity' as const].map((k) =>
          qc.invalidateQueries({ queryKey: keys[k](houseId) }),
        ),
      )
    },
  })
}

export const useItems = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.items(houseId), queryFn: () => queries.items(houseId) })
}

/** One item, from the house's item list (so it updates with it). */
export const useItem = (houseId: HouseId, id: ItemId | null) => {
  const items = useItems(houseId)
  return id ? items.data?.find((i) => i.id === id) : undefined
}

export const useFeelings = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.feelings(houseId), queryFn: () => queries.feelings(houseId) })
}

/** An item's activity (for Earlier feelings and, later, its path through runs). */
export const useItemActivity = (houseId: HouseId, itemId: ItemId) => {
  const { queries } = useAppClient()
  return useQuery({
    queryKey: keys.itemActivity(houseId, itemId),
    queryFn: () => queries.itemActivity(houseId, itemId),
  })
}

/** The latest change to the feeling weights, for the Home card. */
export const useLatestWeightsChange = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({
    queryKey: keys.weightsChange(houseId),
    queryFn: async () =>
      (await queries.latestActivity(houseId, 'settings.feeling_weights_changed')) ?? null,
  })
}

export const useSetFeelingWeights = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, w: FeelingWeights) => c.setFeelingWeights(w), ['house'])

export const useSetFeeling = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['setFeeling']>[0]) => c.setFeeling(i), [
    'feelings',
  ])

export const useRuns = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.runs(houseId), queryFn: () => queries.runs(houseId) })
}

/** A run's story (for the run sheet's rows and its progress). */
export const useRunActivity = (houseId: HouseId, runId: RunId) => {
  const { queries } = useAppClient()
  return useQuery({
    queryKey: keys.runActivity(houseId, runId),
    queryFn: () => queries.runActivity(houseId, runId),
  })
}

type Cmd<K extends keyof AppCommands> = Parameters<AppCommands[K]>[0]
const RUN_AFFECTS: HouseKey[] = ['runs', 'items', 'costs']
export const useStartRun = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'startRun'>) => c.startRun(i), RUN_AFFECTS)
export const useAddToRun = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'addToRun'>) => c.addToRun(i), RUN_AFFECTS)
export const useMarkRunItemsDone = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'markRunItemsDone'>) => c.markRunItemsDone(i), RUN_AFFECTS)
export const useMoveRunItems = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'moveRunItems'>) => c.moveRunItems(i), RUN_AFFECTS)
export const useReturnToPool = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'returnToPool'>) => c.returnToPool(i), RUN_AFFECTS)
export const useFinishRun = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'finishRun'>) => c.finishRun(i), RUN_AFFECTS)
export const useStartRequest = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'startRequest'>) => c.startRequest(i), RUN_AFFECTS)
export const usePlanVisit = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'planVisit'>) => c.planVisit(i), RUN_AFFECTS)
export const useAddToRequest = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'addToRequest'>) => c.addToRequest(i), RUN_AFFECTS)
export const useSendRequest = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'sendRequest'>) => c.sendRequest(i), RUN_AFFECTS)
export const useHandToContact = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'handToContact'>) => c.handToContact(i), RUN_AFFECTS)
export const useMoveToNewVisit = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'moveToNewVisit'>) => c.moveToNewVisit(i), RUN_AFFECTS)
export const useSetVisitDate = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'setVisitDate'>) => c.setVisitDate(i), RUN_AFFECTS)

export const useCosts = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.costs(houseId), queryFn: () => queries.costs(houseId) })
}
export const useAddCost = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'addCost'>) => c.addCost(i), ['costs'])
export const useCopiedToSplitwise = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'copiedToSplitwise'>) => c.copiedToSplitwise(i), [])

export const usePolls = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.polls(houseId), queryFn: () => queries.polls(houseId) })
}
export const useCreatePoll = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'createPoll'>) => c.createPoll(i), ['polls'])
export const useVote = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'vote'>) => c.vote(i), ['polls'])
export const useAddPollOption = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'addPollOption'>) => c.addPollOption(i), ['polls'])
export const useClosePoll = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'closePoll'>) => c.closePoll(i), ['polls'])

export const useCreateItem = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: NewItem) => c.createItem(i), ['items'])
export const useEditItem = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['editItem']>[0]) => c.editItem(i), [
    'items',
  ])
export const useMarkDone = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, id: ItemId) => c.markDone(id), ['items'])
export const useReopenItem = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, id: ItemId) => c.reopenItem(id), ['items'])
export const useDoChore = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, id: ItemId) => c.doChore(id), ['items'])
export const useArchiveItem = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, id: ItemId) => c.archiveItem(id), ['items'])
export const useRestoreItem = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, id: ItemId) => c.restoreItem(id), ['items'])

export const useEditContact = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['editContact']>[0]) => c.editContact(i), [
    'contacts',
  ])
export const useRemoveContact = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, id: ContactId) => c.removeContact(id), ['contacts'])
export const useAddContact = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: NewContact) => c.createContact(i), ['contacts'])
export const useMoveOut = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['moveOut']>[0]) => c.moveOut(i), [
    'members',
  ])
export const useSetRole = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['setRole']>[0]) => c.setRole(i), [
    'members',
  ])
export const useRenameRoom = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['renameRoom']>[0]) => c.renameRoom(i), [
    'rooms',
  ])
export const useMoveRoom = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['moveRoom']>[0]) => c.moveRoom(i), [
    'rooms',
  ])

const ACTIVITY_PAGE = 30

/** The activity log, a page at a time (newest first). */
export const useActivity = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useInfiniteQuery({
    queryKey: keys.activity(houseId),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      queries.activity(houseId, { before: pageParam, limit: ACTIVITY_PAGE }),
    getNextPageParam: (last) => last.before ?? undefined,
  })
}

/**
 * Refreshes the house's queries when a change lands (ours or a roommate's): whatever the changed
 * table feeds, plus the activity log (T26).
 */
export const useLiveUpdates = (houseId: HouseId) => {
  const { changes } = useAppClient()
  const qc = useQueryClient()
  useEffect(
    () =>
      changes.subscribe(houseId, (change) => {
        for (const queryKey of [...keysForTable(houseId, change.table), keys.activity(houseId)])
          void qc.invalidateQueries({ queryKey })
      }),
    [changes, houseId, qc],
  )
}

/** Whether the person using the app is an admin of this house. */
export const useIsAdmin = (houseId: HouseId): boolean => {
  const { me } = useAppClient()
  const members = useMembers(houseId)
  return (
    members.data?.some((m) => m.userId === me && m.role === 'admin' && m.status.active) ?? false
  )
}

/** Resolves to the command's Result; refreshes the house's contacts when it worked. */
export const useCreateContact = (houseId: HouseId) => {
  const { commands } = useAppClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewContact) => commands.createContact(input),
    onSuccess: (r) => {
      if (r.ok) return qc.invalidateQueries({ queryKey: keys.contacts(houseId) })
    },
  })
}

/** The house's current feelings, grouped by item. */
export const useFeelingsByItem = (houseId: HouseId): ReadonlyMap<string, Feeling[]> => {
  const feelings = useFeelings(houseId)
  return useMemo(() => {
    const m = new Map<string, Feeling[]>()
    for (const f of feelings.data ?? []) m.set(f.itemId, [...(m.get(f.itemId) ?? []), f])
    return m
  }, [feelings.data])
}
