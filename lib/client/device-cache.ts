// The house's lists, kept on this device between opens (T114, ARCHITECTURE A42), so the app opens
// with what it last showed and refreshes behind it, instead of starting from "Loading…".
//
// What's kept is a copy of the screens' lists, never the truth: every kept list is older than
// `staleTime`, so it's fetched again as soon as a screen uses it, and the server's answer replaces
// it. One copy per device, for one user, house and build; under 24 hours old; never when the
// phone is offline (the app stays online-only, A25); gone on sign-out, Delete my account, and
// whenever the sign-in page opens.

import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { HouseId, UserId } from '../domain/ids'
import { keys } from './query-keys'

/** Bump when a kept list's shape changes, so a copy in the old shape is never read. */
const SHAPE = 1
const PREFIX = 'roomies.houseCache'
export const MAX_AGE_MS = 24 * 60 * 60 * 1000
/** A copy bigger than this isn't kept (localStorage holds about 5 MB per site). */
const MAX_CHARS = 1_500_000
/** Changes are written this long after they land, together. */
export const SAVE_AFTER_MS = 1_000

/**
 * The lists the screens draw from when the app opens. Not the activity log (paged and long),
 * invites (organizers only), anything under activity (`weightsChange`, `splitwiseCopied`, which
 * holds a Set), or your notification toggles (read only on their own page).
 */
export const KEPT = [
  'house',
  'members',
  'profiles',
  'rooms',
  'routines',
  'contacts',
  'items',
  'feelings',
  'runs',
  'polls',
  'costs',
] as const
export type Kept = (typeof KEPT)[number]

/** Whose copy: the signed-in person, their house, and the build that wrote it. */
export type CacheScope = {
  readonly userId: UserId
  readonly houseId: HouseId
  /** The deployed commit ('dev' locally); a new deploy never reads an older build's copy. */
  readonly build: string
}

type Saved = {
  readonly savedAt: number
  readonly lists: readonly { name: Kept; data: unknown; updatedAt: number }[]
}

export const cacheKey = (s: CacheScope): string =>
  `${PREFIX}:${SHAPE}:${s.build}:${s.userId}:${s.houseId}`

const isKeptName = (name: unknown): name is Kept => KEPT.includes(name as Kept)

/** Whether a query is one of this house's kept lists. */
export const isKeptQuery = (queryKey: QueryKey, houseId: HouseId): boolean =>
  queryKey.length === 3 &&
  queryKey[0] === 'house' &&
  queryKey[1] === houseId &&
  isKeptName(queryKey[2])

/** localStorage, or null where the browser refuses it (some private windows). */
export const deviceStorage = (): Storage | null => {
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

const copiesOn = (storage: Storage): string[] => {
  const found: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key?.startsWith(PREFIX)) found.push(key)
  }
  return found
}

const remove = (storage: Storage, key: string) => {
  try {
    storage.removeItem(key)
  } catch {
    // Nothing more to do: it can't be read either.
  }
}

/** Counts every forget, so a save that was already on its way doesn't write a copy back. */
let forgets = 0

/** Removes every house's copy from this device. */
export const forgetHouseData = (storage: Storage | null = deviceStorage()): void => {
  forgets++
  if (!storage) return
  try {
    for (const key of copiesOn(storage)) remove(storage, key)
  } catch {
    // A storage that can't list its keys couldn't have been written to either.
  }
}

const isSaved = (v: unknown): v is Saved =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Saved).savedAt === 'number' &&
  Array.isArray((v as Saved).lists)

/**
 * Puts the kept copy into this house's lists that have nothing yet (never over what the network
 * already brought), marked stale, so each is fetched again as soon as a screen uses it. Returns
 * how many lists it filled.
 */
export const restoreHouseData = (
  qc: QueryClient,
  scope: CacheScope,
  storage: Storage | null,
  now: number,
): number => {
  if (!storage) return 0
  const key = cacheKey(scope)
  let saved: unknown
  try {
    const raw = storage.getItem(key)
    if (raw === null) return 0
    saved = JSON.parse(raw)
  } catch {
    remove(storage, key)
    return 0
  }
  if (!isSaved(saved) || now - saved.savedAt > MAX_AGE_MS || saved.savedAt > now) {
    remove(storage, key)
    return 0
  }
  let filled = 0
  for (const list of saved.lists) {
    if (!isKeptName(list?.name) || list.data === undefined || list.data === null) continue
    const queryKey = keys[list.name](scope.houseId)
    if (qc.getQueryData(queryKey) !== undefined) continue
    qc.setQueryData(queryKey, list.data, { updatedAt: Math.min(list.updatedAt, saved.savedAt) })
    // Always fetched again, however recent the copy: Realtime heard nothing while the app was
    // closed. (Filled before a screen subscribes, a copy from a few seconds ago would otherwise
    // count as fresh for `staleTime` and never be fetched.)
    void qc.invalidateQueries({ queryKey, exact: true, refetchType: 'none' })
    filled++
  }
  return filled
}

/**
 * Writes this house's kept lists that have loaded, and removes any other copy (another person's,
 * house's or build's). Returns whether a copy was written.
 */
export const saveHouseData = (
  qc: QueryClient,
  scope: CacheScope,
  storage: Storage | null,
  now: number,
): boolean => {
  if (!storage) return false
  const key = cacheKey(scope)
  const lists = KEPT.flatMap((name) => {
    const state = qc.getQueryState(keys[name](scope.houseId))
    return state?.status === 'success' && state.data !== undefined
      ? [{ name, data: state.data, updatedAt: state.dataUpdatedAt }]
      : []
  })
  try {
    for (const other of copiesOn(storage)) if (other !== key) remove(storage, other)
    if (lists.length === 0) return false
    const raw = JSON.stringify({ savedAt: now, lists } satisfies Saved)
    if (raw.length > MAX_CHARS) {
      remove(storage, key)
      return false
    }
    storage.setItem(key, raw)
    return true
  } catch {
    // Full, or refused: better no copy than half of one.
    remove(storage, key)
    return false
  }
}

/**
 * Keeps this house's lists on the device while the house's screens are open: fills them from the
 * kept copy once, after the page has hydrated (the server's HTML has no data, so filling sooner
 * would make the first render disagree with it), then writes a new copy a second after a list
 * changes and when the app goes to the background. A copy is never written while a tap is still
 * being saved (T113), so it holds what the server last said.
 */
export const useKeepHouseData = (scope: CacheScope): void => {
  const qc = useQueryClient()
  const { userId, houseId, build } = scope
  useEffect(() => {
    const storage = deviceStorage()
    if (!storage) return
    const here: CacheScope = { userId, houseId, build }
    const forgetsAtStart = forgets
    if (navigator.onLine !== false) restoreHouseData(qc, here, storage, Date.now())

    let timer: ReturnType<typeof setTimeout> | undefined
    const save = () => {
      clearTimeout(timer)
      timer = undefined
      if (forgets !== forgetsAtStart || qc.isMutating() > 0) return
      saveHouseData(qc, here, storage, Date.now())
    }
    const soon = () => {
      timer ??= setTimeout(save, SAVE_AFTER_MS)
    }
    const stopQueries = qc.getQueryCache().subscribe((e) => {
      if (
        e.type === 'updated' &&
        e.action.type === 'success' &&
        isKeptQuery(e.query.queryKey, houseId)
      )
        soon()
    })
    const stopMutations = qc.getMutationCache().subscribe((e) => {
      if (e.type === 'updated' && e.mutation.state.status !== 'pending') soon()
    })
    const hidden = () => {
      if (document.visibilityState === 'hidden') save()
    }
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', save)
    return () => {
      // Leaving the house's screens (signing out, say) writes nothing more.
      clearTimeout(timer)
      stopQueries()
      stopMutations()
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', save)
    }
  }, [qc, userId, houseId, build])
}

/** Forgets every kept copy when it mounts: for pages where nobody is in a house. */
export const useForgetHouseData = (): void => {
  useEffect(() => forgetHouseData(), [])
}
