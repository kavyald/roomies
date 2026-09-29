// How the Needs, Chores, and Tasks tabs order and filter items (FRONTEND §5.5–5.7). Pure.

import type { UserId } from './ids'
import type { Chore, Item, Need, Task } from './items'
import { calendarDaysBetween, type Instant } from './time'

const whenKey = (i: Item) => (i.when ? `${i.when.date} ${i.when.time ?? '99:99'}` : null)

export type TaskFilter = 'mine' | 'all' | 'outside'

/**
 * Open tasks for the Tasks tab. Mine = assigned to me; Outside help = handled by a contact.
 * Dated tasks first, soonest first; then the rest, newest first.
 */
export const taskList = (items: readonly Item[], filter: TaskFilter, me: UserId): Task[] =>
  items
    .filter((i): i is Task => i.category === 'task' && !i.done && !i.archivedAt)
    .filter((t) =>
      filter === 'mine' ? t.assignee === me : filter === 'outside' ? !!t.contactId : true,
    )
    .sort((a, b) => {
      const ka = whenKey(a)
      const kb = whenKey(b)
      if (ka && kb) return ka.localeCompare(kb)
      if (ka) return -1
      if (kb) return 1
      return b.createdAt.epochMs - a.createdAt.epochMs
    })

/**
 * Open needs for the Needs tab (FRONTEND §5.5): the ones someone has a feeling about first
 * (ranked by `feelingScore`, highest first), then by needed-by date, then newest.
 */
export const needList = (
  items: readonly Item[],
  feelingScore: (id: Item['id']) => number = () => 0,
): Need[] =>
  items
    .filter((i): i is Need => i.category === 'need' && !i.done && !i.archivedAt)
    .sort((a, b) => {
      const fa = feelingScore(a.id)
      const fb = feelingScore(b.id)
      if (fa !== fb) return fb - fa
      const ka = whenKey(a)
      const kb = whenKey(b)
      if (ka && kb && ka !== kb) return ka.localeCompare(kb)
      if (ka && !kb) return -1
      if (kb && !ka) return 1
      return b.createdAt.epochMs - a.createdAt.epochMs
    })

/** Calendar days since a chore was last done, as the house sees it, or null if never. */
export const daysSinceDone = (c: Chore, now: Instant, tz: string): number | null =>
  c.lastDone ? calendarDaysBetween(c.lastDone.at, now, tz) : null

/**
 * How far past its rhythm a chore is: 1 means exactly due, 9/7 means two days past. Never done
 * counts as very far past; as-needed chores have no rhythm (null).
 */
export const choreLateness = (c: Chore, now: Instant, tz: string): number | null => {
  if (!c.repeatDays) return null
  const days = daysSinceDone(c, now, tz)
  return days === null ? Number.POSITIVE_INFINITY : days / c.repeatDays
}

/** Whether a repeating chore is past its "about every N days" (and so belongs in the feed). */
export const isChoreDue = (c: Chore, now: Instant, tz: string): boolean =>
  (choreLateness(c, now, tz) ?? 0) > 1

/**
 * Open chores for the Chores tab (FRONTEND §5.6): the ones furthest past their rhythm first; then
 * as-needed chores, longest since done first.
 */
export const choreList = (items: readonly Item[], now: Instant, tz: string): Chore[] =>
  items
    .filter((i): i is Chore => i.category === 'chore' && !i.archivedAt)
    .sort((a, b) => {
      const la = choreLateness(a, now, tz)
      const lb = choreLateness(b, now, tz)
      if (la !== null && lb !== null && la !== lb) return lb - la
      if (la !== null && lb === null) return -1
      if (lb !== null && la === null) return 1
      const da = a.lastDone?.at.epochMs ?? Number.NEGATIVE_INFINITY
      const db = b.lastDone?.at.epochMs ?? Number.NEGATIVE_INFINITY
      return da - db || a.title.localeCompare(b.title)
    })

/** "today", "yesterday", "9 days ago". */
export const daysAgo = (days: number): string =>
  days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
