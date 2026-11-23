// Which queries this browser's own commands are refreshing (T113). Every change comes back over
// Realtime, mine included; when a command here already refreshes a query, refreshing it again for
// the echo is a second download of the same list.
//
// The echo can't be matched to its command (the activity row carries no id the browser knows), so
// this goes by who and when: a change by me counts as covered while a command of mine that
// refreshes that query is being saved, and for a short while after. A change I make on another
// device arrives with no command here, so it refreshes as a roommate's would.

import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query'

/** How long after a command settles its echo may still arrive. */
const ECHO_WINDOW_MS = 5_000

type Covered = { saving: number; until: number }

export type OwnChanges = {
  /** A command that will refresh these queries has started. */
  started(queryKeys: readonly QueryKey[]): void
  /** It has been answered (or failed). */
  settled(queryKeys: readonly QueryKey[]): void
  /** Whether an echo of my own change needn't refresh this query. */
  covers(queryKey: QueryKey): boolean
}

const byClient = new WeakMap<QueryClient, OwnChanges>()

export const makeOwnChanges = (now: () => number = Date.now): OwnChanges => {
  const covered = new Map<string, Covered>()
  const entry = (queryKey: QueryKey) => {
    const hash = hashKey(queryKey)
    let c = covered.get(hash)
    if (!c) covered.set(hash, (c = { saving: 0, until: 0 }))
    return c
  }
  return {
    started: (queryKeys) => queryKeys.forEach((k) => entry(k).saving++),
    settled: (queryKeys) =>
      queryKeys.forEach((k) => {
        const c = entry(k)
        c.saving = Math.max(0, c.saving - 1)
        c.until = now() + ECHO_WINDOW_MS
      }),
    covers: (queryKey) => {
      const c = covered.get(hashKey(queryKey))
      return !!c && (c.saving > 0 || now() < c.until)
    },
  }
}

/** One per QueryClient, so it lives and dies with the cache it describes. */
export const ownChanges = (qc: QueryClient): OwnChanges => {
  let mine = byClient.get(qc)
  if (!mine) byClient.set(qc, (mine = makeOwnChanges()))
  return mine
}
