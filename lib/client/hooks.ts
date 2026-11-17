'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import {
  DEFAULT_FEELING_WEIGHTS,
  isFeelingActive,
  type Feeling,
  type FeelingWeights,
} from '../domain/feelings'
import type { Ranking } from '../domain/lists'
import type { NewContact } from '../domain/contacts'
import type { AppCommands } from './app-client'
import type { ContactId, HouseId, InviteId, ItemId, RoutineId, RunId } from '../domain/ids'
import type { NewItem } from '../domain/items'
import type { NewInvite } from '../domain/invites'
import { useAppClient } from './provider'
import { useNow } from './use-now'
import { keys, keysForTable } from './query-keys'
import * as tap from './optimistic'
import type { OptimisticCtx } from './optimistic'
import { ownChanges } from './own-changes'
import { inOrder, stillSaving, whenSaved } from './in-order'
import type { Item } from '../domain/items'
import type { Poll } from '../domain/polls'
import { err } from '../domain/result'
import { instant } from '../domain/time'

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

/** Answers that mean this screen was behind: someone saved or moved the thing first (§7.5). */
const STALE = new Set(['conflict', 'not_on_run', 'already_on_a_run'])
/** Whether a command's error means someone got there first; the house refetches on its own. */
export const isStale = (error: string | undefined): boolean => STALE.has(error ?? '')
/** What a screen says when it was behind (FRONTEND §7). */
export const CHANGED_MEANWHILE = "Someone just changed this. Here's the latest."

/**
 * What a command shows before the server answers (T113): one cached list, changed by pure
 * functions from lib/client/optimistic.
 */
type Optimistic<I, V> = {
  readonly key: HouseKey
  /** What the tap is on. Taps on the same thing are saved one at a time, in order. */
  readonly subject: (input: I) => string
  /** The list to show while it saves. */
  readonly show: (list: never, input: I, ctx: OptimisticCtx) => unknown
  /** The list once the server has answered with what it saved. */
  readonly land: (list: never, saved: V, input: I, ctx: OptimisticCtx) => unknown
}
// The list's type is the query's; each use below pairs a key with functions for that list.
const optimistic = <D, I, V>(
  key: HouseKey,
  o: {
    subject: (input: I) => string
    show: (list: D, input: I, ctx: OptimisticCtx) => D
    land: (list: D, saved: V, input: I, ctx: OptimisticCtx) => D
  },
): Optimistic<I, V> => ({ key, ...o }) as Optimistic<I, V>

/** Names the optimistic commands still being saved in a house, so they can be counted. */
const savingKey = (houseId: HouseId) => ['house', houseId, 'saving'] as const

const useHouseCommand = <I, V, R extends { ok: boolean; value?: V }>(
  houseId: HouseId,
  run: (commands: ReturnType<typeof useAppClient>['commands'], input: I) => Promise<R>,
  affects: HouseKey[],
  /**
   * With this, the tap shows at once (T113): the list changes before the server answers, the
   * command is over when the server has answered (not when the refetch lands), and a refusal puts
   * the old list back. Without it, the command is pending until the refreshed data is in.
   */
  shows?: Optimistic<I, V>,
) => {
  const { commands, me } = useAppClient()
  const qc = useQueryClient()
  const refreshed = [...affects, 'activity' as const].map((k) => keys[k](houseId))
  const refresh = () => Promise.all(refreshed.map((queryKey) => qc.invalidateQueries({ queryKey })))
  /** Another optimistic tap is still being saved: its answer refreshes for both. */
  const othersSaving = () => qc.isMutating({ mutationKey: savingKey(houseId) }) > 1

  return useMutation({
    ...(shows && { mutationKey: savingKey(houseId) }),
    mutationFn: (input: I) => {
      if (!shows) return run(commands, input)
      const subject = shows.subject(input)
      return inOrder(qc, subject, async () => {
        // A request that never came back (offline, dropped) counts as a refusal, so the tap is
        // put back and the screen says so, the way it does when the server says no.
        const r = await run(commands, input).catch(() => err('unexpected') as unknown as R)
        // What the server saved replaces what the tap showed (the real time, the new version),
        // unless a later tap on the same thing is already showing something newer. Done here,
        // inside the queue, so whoever waits for this save (`whenSaved`) reads the saved copy.
        const queryKey = keys[shows.key](houseId)
        const list = qc.getQueryData(queryKey)
        if (r.ok && list !== undefined && stillSaving(qc, subject) === 1) {
          const ctx: OptimisticCtx = { me, now: instant(Date.now()) }
          qc.setQueryData(queryKey, shows.land(list as never, r.value as V, input, ctx))
        }
        return r
      })
    },
    onMutate: async (input) => {
      ownChanges(qc).started(refreshed)
      if (!shows) return undefined
      const queryKey = keys[shows.key](houseId)
      // A fetch that started before the tap would put the old list back when it lands.
      await qc.cancelQueries({ queryKey, exact: true })
      const before = qc.getQueryData(queryKey)
      if (before === undefined) return undefined
      const ctx: OptimisticCtx = { me, now: instant(Date.now()) }
      qc.setQueryData(queryKey, shows.show(before as never, input, ctx))
      return { queryKey, before }
    },
    onError: (_e, _input, shown) => {
      // The server never answered (offline, a dropped request): we can't know if it saved.
      if (shown && !othersSaving()) qc.setQueryData(shown.queryKey, shown.before)
      ownChanges(qc).settled(refreshed)
      return refresh()
    },
    onSuccess: (r, _input, shown) => {
      ownChanges(qc).settled(refreshed)
      if (!r.ok) {
        // Refused: back to what was there, unless a later tap has changed the list since.
        if (shown && !othersSaving()) qc.setQueryData(shown.queryKey, shown.before)
        // Someone saved the same thing first (§7.5): fetch the latest of everything in the house.
        if (isStale((r as { error?: string }).error))
          return qc.invalidateQueries({ queryKey: keys.house(houseId) })
        if (shows && !othersSaving()) void refresh()
        return
      }
      if (!shows) return refresh()
      // A refetch for this tap could land between a later tap and its answer and show the list
      // without that tap, so only the last one still saving refreshes.
      if (!othersSaving()) void refresh()
    },
  })
}

const itemTap = (
  show: (items: readonly Item[], id: ItemId, ctx: OptimisticCtx) => readonly Item[],
) =>
  optimistic<readonly Item[], ItemId, Item>('items', {
    subject: (id) => id,
    show,
    land: tap.landItem,
  })
const pollTap = <I extends { pollId: string }>(
  show: (polls: readonly Poll[], input: I, ctx: OptimisticCtx) => readonly Poll[],
) =>
  optimistic<readonly Poll[], I, Poll>('polls', {
    subject: (i) => i.pollId,
    show,
    land: tap.landPoll,
  })

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

/** The latest change to the feeling weights, for the House card. */
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

export const useSetSplitwiseGroup = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: { link: string | null }) => c.setSplitwiseGroup(i), ['house'])

export const useSetFeeling = (houseId: HouseId) =>
  useHouseCommand(
    houseId,
    (c, i: Parameters<AppCommands['setFeeling']>[0]) => c.setFeeling(i),
    ['feelings'],
    optimistic<readonly Feeling[], Parameters<AppCommands['setFeeling']>[0], Feeling | null>(
      'feelings',
      {
        subject: (i) => `feeling:${i.itemId}`,
        show: tap.setFeeling,
        land: tap.landFeeling,
      },
    ),
  )

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
export const useRenameRun = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'renameRun'>) => c.renameRun(i), RUN_AFFECTS)
export const useSetRunner = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'setRunner'>) => c.setRunner(i), RUN_AFFECTS)

export const useCosts = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.costs(houseId), queryFn: () => queries.costs(houseId) })
}
export const useAddCost = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'addCost'>) => c.addCost(i), ['costs'])
export const useEditCost = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'editCost'>) => c.editCost(i), ['costs'])
export const useRemoveCost = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'removeCost'>) => c.removeCost(i), ['costs'])
/** Which costs someone has sent to Splitwise, so their icon shows it (T89). */
export const useSplitwiseCopied = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({
    queryKey: keys.splitwiseCopied(houseId),
    queryFn: async () => new Set<string>(await queries.splitwiseCopied(houseId)),
  })
}
export const useCopiedToSplitwise = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'copiedToSplitwise'>) => c.copiedToSplitwise(i), [])

/** The notification categories I turned off. */
export const useMyNotificationsOff = (houseId: HouseId) => {
  const { queries, me } = useAppClient()
  return useQuery({
    queryKey: keys.notificationsOff(houseId),
    queryFn: () => queries.notificationsOff(me),
  })
}
export const useSetNotificationEnabled = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'setNotificationEnabled'>) => c.setNotificationEnabled(i), [
    'notificationsOff',
  ])
export const useUpdateMySettings = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'updateMySettings'>) => c.updateMySettings(i), ['profiles'])
/** Nothing in the house changes: members never read feedback back. */
export const useSendFeedback = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'sendFeedback'>) => c.sendFeedback(i), [])

export const usePolls = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.polls(houseId), queryFn: () => queries.polls(houseId) })
}
export const useCreatePoll = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'createPoll'>) => c.createPoll(i), ['polls'])
export const useVote = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'vote'>) => c.vote(i), ['polls'], pollTap(tap.vote))
export const useAddPollOption = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'addPollOption'>) => c.addPollOption(i), ['polls'])
export const useClosePoll = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'closePoll'>) => c.closePoll(i), ['polls'])
export const useWithdrawVote = (houseId: HouseId) =>
  useHouseCommand(
    houseId,
    (c, i: Cmd<'withdrawVote'>) => c.withdrawVote(i),
    ['polls'],
    pollTap(tap.withdrawVote),
  )
export const useReopenPoll = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'reopenPoll'>) => c.reopenPoll(i), ['polls'])
export const useSetPollDeadline = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'setPollDeadline'>) => c.setPollDeadline(i), ['polls'])

export const useCreateItem = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: NewItem) => c.createItem(i), ['items'])
export const useEditItem = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['editItem']>[0]) => c.editItem(i), [
    'items',
  ])
export const useMarkDone = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, id: ItemId) => c.markDone(id), ['items'], itemTap(tap.markDone))
export const useReopenItem = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, id: ItemId) => c.reopenItem(id), ['items'], itemTap(tap.reopen))
export const useDoChore = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, id: ItemId) => c.doChore(id), ['items'], itemTap(tap.doChore))
export const useUndoChore = (houseId: HouseId) =>
  useHouseCommand(
    houseId,
    (c, i: Cmd<'undoChore'>) => c.undoChore(i),
    ['items'],
    optimistic<readonly Item[], Cmd<'undoChore'>, Item>('items', {
      subject: (i) => i.id,
      show: tap.undoChore,
      land: tap.landItem,
    }),
  )

/**
 * When I last did a chore, as the server saved it. A tick shows at once with the browser's time,
 * but Undo has to name the saved one, so this waits for a tick that's still being saved.
 */
export const useSavedLastDone = (houseId: HouseId) => {
  const qc = useQueryClient()
  return async (id: ItemId): Promise<number | undefined> => {
    await whenSaved(qc, id)
    const item = qc.getQueryData<readonly Item[]>(keys.items(houseId))?.find((i) => i.id === id)
    return item?.category === 'chore' ? item.lastDone?.at.epochMs : undefined
  }
}

/** House → Rooms: several Deep clean chores for a room at once (T101). */
export const useAddRoomChores = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Cmd<'addRoomChores'>) => c.addRoomChores(i), ['items'])
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
export const useChangeMyRoom = (houseId: HouseId) =>
  useHouseCommand(
    houseId,
    (c, i: Parameters<AppCommands['changeMyRoom']>[0]) => c.changeMyRoom(i),
    ['members'],
  )
export const useSetRole = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['setRole']>[0]) => c.setRole(i), [
    'members',
  ])
export const useRoutines = (houseId: HouseId) => {
  const { queries } = useAppClient()
  return useQuery({ queryKey: keys.routines(houseId), queryFn: () => queries.routines(houseId) })
}
export const useCreateRoutine = (houseId: HouseId) =>
  useHouseCommand(
    houseId,
    (c, i: Parameters<AppCommands['createRoutine']>[0]) => c.createRoutine(i),
    ['routines', 'rooms', 'items'],
  )
export const useEditRoutine = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, i: Parameters<AppCommands['editRoutine']>[0]) => c.editRoutine(i), [
    'routines',
    'rooms',
    'items',
  ])
export const useRemoveRoutine = (houseId: HouseId) =>
  useHouseCommand(houseId, (c, id: RoutineId) => c.removeRoutine(id), [
    'routines',
    'rooms',
    'items',
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
 * table feeds, plus the activity log (T26). The echo of a change this screen just made is left
 * out where the command refreshes the same queries itself.
 */
export const useLiveUpdates = (houseId: HouseId) => {
  const { changes, me } = useAppClient()
  const qc = useQueryClient()
  useEffect(
    () =>
      changes.subscribe(houseId, (change) => {
        const mine = change.by === me ? ownChanges(qc) : null
        for (const queryKey of [...keysForTable(houseId, change.table), keys.activity(houseId)]) {
          // My own change, from a command here that refreshes this itself (T113).
          if (mine?.covers(queryKey)) continue
          void qc.invalidateQueries({ queryKey })
        }
      }),
    [changes, houseId, qc, me],
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
  const feelings = useActiveFeelings(houseId)
  return useMemo(() => {
    const m = new Map<string, Feeling[]>()
    for (const f of feelings) m.set(f.itemId, [...(m.get(f.itemId) ?? []), f])
    return m
  }, [feelings])
}

/** The house's feelings that still count: shared since their item was last taken care of (T99). */
export const useActiveFeelings = (houseId: HouseId): readonly Feeling[] => {
  const feelings = useFeelings(houseId)
  const items = useItems(houseId)
  return useMemo(() => {
    const byId = new Map((items.data ?? []).map((i) => [i.id as string, i]))
    return (feelings.data ?? []).filter((f) => {
      const item = byId.get(f.itemId)
      return !item || isFeelingActive(item, f)
    })
  }, [feelings.data, items.data])
}

const NO_FEELINGS: readonly Feeling[] = []

/**
 * What a ranked tab needs (T108): the house's feelings and weights, now, and its time zone. Before
 * the house loads, the default weights and UTC.
 */
export const useRanking = (houseId: HouseId): Ranking => {
  const house = useHouse(houseId)
  const feelings = useFeelings(houseId)
  const now = useNow()
  return {
    feelings: feelings.data ?? NO_FEELINGS,
    weights: house.data?.settings.feelingWeights ?? DEFAULT_FEELING_WEIGHTS,
    now,
    tz: house.data?.settings.timezone ?? 'UTC',
  }
}
