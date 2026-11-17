// What a tap shows before the server answers (T113, ARCHITECTURE A41): pure functions from the
// cached list and the command's input to the list the screen should show meanwhile. The server
// stays the judge: its answer refreshes the list, and a refusal puts the old one back.

import type { Feeling, FeelingKind } from '../domain/feelings'
import type { ItemId, OptionId, PollId, UserId } from '../domain/ids'
import type { Item } from '../domain/items'
import type { Poll } from '../domain/polls'
import type { Instant } from '../domain/time'

export type OptimisticCtx = { readonly me: UserId; readonly now: Instant }

const changeItem = (
  items: readonly Item[],
  id: ItemId,
  change: (item: Item) => Item,
): readonly Item[] => items.map((i) => (i.id === id ? change(i) : i))

/** Got it / Done: a need or task is done by me, now. Chores have no "done". */
export const markDone = (items: readonly Item[], id: ItemId, ctx: OptimisticCtx) =>
  changeItem(items, id, (i) =>
    i.category === 'chore' || i.done ? i : { ...i, done: { at: ctx.now, by: ctx.me } },
  )

/** Undo of Got it: open again. */
export const reopen = (items: readonly Item[], id: ItemId) =>
  changeItem(items, id, (i) => {
    if (i.category === 'chore' || !i.done) return i
    const { done: _done, ...open } = i
    return open
  })

/** Did it: the chore was last done by me, now. */
export const doChore = (items: readonly Item[], id: ItemId, ctx: OptimisticCtx) =>
  changeItem(items, id, (i) =>
    i.category === 'chore' ? { ...i, lastDone: { at: ctx.now, by: ctx.me } } : i,
  )

/**
 * Undo of Did it: not done this time. The last done before it is in the activity log, which the
 * browser doesn't hold, so the chore shows none until the server's answer brings it.
 */
export const undoChore = (items: readonly Item[], input: { id: ItemId }) =>
  changeItem(items, input.id, (i) => {
    if (i.category !== 'chore' || !i.lastDone) return i
    const { lastDone: _lastDone, ...rest } = i
    return rest
  })

/** My feeling about an item: set, changed (with its note), or removed with `kind: null`. */
export const setFeeling = (
  feelings: readonly Feeling[],
  input: { itemId: ItemId; kind: FeelingKind | null; note?: string },
  ctx: OptimisticCtx,
): readonly Feeling[] => {
  const others = feelings.filter((f) => !(f.itemId === input.itemId && f.by === ctx.me))
  if (input.kind === null) return others
  const note = input.note?.trim()
  return [
    ...others,
    { itemId: input.itemId, by: ctx.me, kind: input.kind, at: ctx.now, ...(note && { note }) },
  ]
}

const changePoll = (
  polls: readonly Poll[],
  id: PollId,
  change: (poll: Poll) => Poll,
): readonly Poll[] => polls.map((p) => (p.id === id ? change(p) : p))

/** My vote in an open poll: one per person, so it replaces any I had. */
export const vote = (
  polls: readonly Poll[],
  input: { pollId: PollId; optionId: OptionId },
  ctx: OptimisticCtx,
) =>
  changePoll(polls, input.pollId, (p) =>
    p.state.open && p.options.some((o) => o.id === input.optionId)
      ? {
          ...p,
          votes: [
            ...p.votes.filter((v) => v.user !== ctx.me),
            { user: ctx.me, option: input.optionId, at: ctx.now },
          ],
        }
      : p,
  )

/** Taking my vote back. */
export const withdrawVote = (
  polls: readonly Poll[],
  input: { pollId: PollId },
  ctx: OptimisticCtx,
) =>
  changePoll(polls, input.pollId, (p) =>
    p.state.open ? { ...p, votes: p.votes.filter((v) => v.user !== ctx.me) } : p,
  )

// ---- When the server has answered: its copy replaces the one shown meanwhile ------------------

/** The saved item, in place of the one the tap showed (its real time, its new version). */
export const landItem = (items: readonly Item[], saved: Item): readonly Item[] =>
  items.map((i) => (i.id === saved.id ? saved : i))

export const landPoll = (polls: readonly Poll[], saved: Poll): readonly Poll[] =>
  polls.map((p) => (p.id === saved.id ? saved : p))

/** My saved feeling about the item, or none if I removed it. */
export const landFeeling = (
  feelings: readonly Feeling[],
  saved: Feeling | null,
  input: { itemId: ItemId },
  ctx: OptimisticCtx,
): readonly Feeling[] => [
  ...feelings.filter((f) => !(f.itemId === input.itemId && f.by === ctx.me)),
  ...(saved ? [saved] : []),
]
