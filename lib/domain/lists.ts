// How the Needs, Chores, and Tasks tabs order and filter items (FRONTEND §5.5–5.7). Pure.

import type { UserId } from './ids'
import type { Item, Need, Task } from './items'

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
