// Taps on the same thing are saved one at a time, in the order they were made (T113): a second tap
// on a chore waits for the first one's answer instead of racing it. Different things don't wait
// for each other.

import type { QueryClient } from '@tanstack/react-query'

type Queue = { last: Promise<unknown>; waiting: number }
const byClient = new WeakMap<QueryClient, Map<string, Queue>>()

const queuesOf = (qc: QueryClient) => {
  let queues = byClient.get(qc)
  if (!queues) byClient.set(qc, (queues = new Map()))
  return queues
}

/** Runs `work` once everything queued earlier for `subject` has been answered. */
export const inOrder = <T>(
  qc: QueryClient,
  subject: string,
  work: () => Promise<T>,
): Promise<T> => {
  const queues = queuesOf(qc)
  const queue = queues.get(subject) ?? { last: Promise.resolve(), waiting: 0 }
  queues.set(subject, queue)
  queue.waiting++
  const mine = queue.last.then(work).finally(() => {
    queue.waiting--
    if (queue.waiting === 0) queues.delete(subject)
  })
  // The next one runs whether or not this one worked.
  queue.last = mine.catch(() => undefined)
  return mine
}

/** How many saves for `subject` haven't been answered yet. */
export const stillSaving = (qc: QueryClient, subject: string): number =>
  queuesOf(qc).get(subject)?.waiting ?? 0

/** Resolves when every save queued so far for `subject` has been answered. */
export const whenSaved = (qc: QueryClient, subject: string): Promise<void> =>
  (queuesOf(qc).get(subject)?.last ?? Promise.resolve()).then(() => undefined)
