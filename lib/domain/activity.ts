// Reading the activity log back as feed lines (ARCHITECTURE §6.4, FRONTEND §7). Pure: names come
// from a lookup, and nothing here knows about the database.

import type { FeelingKind } from './feelings'
import type {
  ActionId,
  ContactId,
  CostId,
  ItemId,
  OptionId,
  PollId,
  RoomId,
  RunId,
  UserId,
} from './ids'
import type { EventKind, FieldChanges, StoredActivityRow } from './events'
import type { Instant } from './time'
import { describeWeightsChange } from './weights'

/** Names for the things rows point at. Anything unknown gets a gentle generic word. */
export type ActivityNames = {
  person(id: UserId): string | undefined
  item?(id: ItemId): { title: string; category?: 'need' | 'chore' | 'task' } | undefined
  run?(id: RunId): string | undefined
  poll?(id: PollId): string | undefined
  option?(id: OptionId): string | undefined
  cost?(id: CostId): string | undefined // e.g. "$42.50"
  contact(id: ContactId): string | undefined
  room(id: RoomId): string | undefined
}

export type FeedLine = {
  readonly actionId: ActionId
  /** The newest row's id and time: the line sits where its action last happened. */
  readonly id: number
  readonly at: Instant
  readonly actorId: UserId | null
  readonly text: string
}

/** Recorded, but never shown in the feed (ARCHITECTURE §6.4 "—"). */
const HIDDEN: ReadonlySet<EventKind> = new Set([
  'chore.undone',
  'feeling.removed',
  'poll.vote_withdrawn',
  'cost.splitwise_copied',
])

/** Shown to admins only. */
const ADMIN_ONLY: ReadonlySet<EventKind> = new Set(['invite.created', 'invite.revoked'])

/**
 * Splits rows (newest first) into one group per user action, keeping the feed's order: a group
 * sits where its newest row is.
 */
export const groupByAction = (rows: readonly StoredActivityRow[]): StoredActivityRow[][] => {
  const groups = new Map<ActionId, StoredActivityRow[]>()
  for (const r of rows) {
    const g = groups.get(r.actionId)
    if (g) g.push(r)
    else groups.set(r.actionId, [r])
  }
  return [...groups.values()]
}

const FEELING_WORDS: Record<FeelingKind, string> = {
  anxious: 'anxious',
  frustrated: 'frustrated',
  confused: 'confused',
  fine: 'fine',
  meh: 'like it’s not a big deal',
  thanks: 'thankful',
}

const count = (n: number, one: string, many = `${one}s`) => (n === 1 ? `1 ${one}` : `${n} ${many}`)

/**
 * One feed line for the rows of one action, or null when the line is hidden from this viewer.
 * A bulk action ("moved 3 tasks to Landlord visit") is one line.
 */
export const activityLine = (
  rows: readonly StoredActivityRow[],
  names: ActivityNames,
  viewer: { readonly isAdmin: boolean },
): FeedLine | null => {
  const visible = rows.filter(
    (r) => !HIDDEN.has(r.kind) && (viewer.isAdmin || !ADMIN_ONLY.has(r.kind)),
  )
  // An action reads as its first event ("Sam joined the house", not the room pick that followed).
  const first = visible.reduce<StoredActivityRow | undefined>(
    (a, b) => (a === undefined || b.id < a.id ? b : a),
    undefined,
  )
  if (!first) return null
  const newest = rows.reduce((a, b) => (b.id > a.id ? b : a))

  const who = (id: UserId | null | undefined) =>
    id === null || id === undefined ? 'Roomies' : (names.person(id) ?? 'Former roommate')
  const actor = who(first.actorId)
  const item = (r: StoredActivityRow) => (r.itemId && names.item?.(r.itemId)?.title) || 'something'
  const run = (id: RunId | undefined) => (id && names.run?.(id)) || 'a run'
  const poll = (r: StoredActivityRow) => `“${(r.pollId && names.poll?.(r.pollId)) || 'a poll'}”`
  const option = (r: StoredActivityRow) =>
    `“${(r.optionId && names.option?.(r.optionId)) || 'an option'}”`
  const contact = (r: StoredActivityRow) =>
    (r.contactId && names.contact(r.contactId)) || 'a contact'
  const room = (r: StoredActivityRow) => (r.roomId && names.room(r.roomId)) || 'a room'
  const member = (r: StoredActivityRow) => who(r.memberId)
  const change = (r: StoredActivityRow, field: string): [unknown, unknown] | undefined =>
    (r.changes as Record<string, [unknown, unknown]> | undefined)?.[field]

  // Several items in one action read as a count: "3 tasks", "2 items".
  const items = (rs: readonly StoredActivityRow[]) => {
    if (rs.length === 1) return item(rs[0]!)
    const cats = new Set(rs.map((r) => (r.itemId && names.item?.(r.itemId)?.category) || 'item'))
    const noun = cats.size === 1 ? [...cats][0]! : 'item'
    return count(rs.length, noun)
  }
  const ofKind = (k: EventKind) => visible.filter((r) => r.kind === k)

  const text = ((): string => {
    const r = first
    switch (r.kind) {
      case 'item.created':
        return `${actor} added ${items(ofKind('item.created'))}`
      case 'item.edited':
        return `${actor} edited ${item(r)}`
      case 'item.done': {
        const category = r.itemId && names.item?.(r.itemId)?.category
        return category === 'need' ? `${actor} got ${item(r)}` : `${actor} finished ${item(r)}`
      }
      case 'item.reopened':
        return `${actor} reopened ${item(r)}`
      case 'item.archived':
        return `${actor} archived ${item(r)}`
      case 'item.restored':
        return `${actor} brought back ${item(r)}`
      case 'item.assigned':
        if (!r.memberId) return `${actor} opened up ${item(r)} for anyone`
        return r.memberId === r.actorId
          ? `${actor} took ${item(r)}`
          : `${actor} put ${member(r)} on ${item(r)}`
      case 'item.handled_by_changed':
        return r.contactId
          ? `${actor} handed ${item(r)} to ${contact(r)}`
          : `${actor} set ${item(r)} to be handled by one of us`
      case 'chore.done':
        return `${actor} did ${items(ofKind('chore.done'))}`
      case 'feeling.set': {
        const next = (r.changes as { next?: { kind?: FeelingKind } } | undefined)?.next?.kind
        return `${actor}’s feeling ${next ? FEELING_WORDS[next] : 'something'} about ${item(r)}`
      }
      case 'poll.created':
        return `${actor} asked ${poll(r)}`
      case 'poll.closed': {
        const result = (r.payload as { result?: string }).result
        if (result === 'winner') return `${poll(r)} closed: ${option(r)} won`
        if (result === 'tie') return `${poll(r)} ended in a tie. Talk it out?`
        return `${poll(r)} closed with no votes`
      }
      case 'poll.reopened':
        return `${actor} reopened ${poll(r)}`
      case 'poll.deadline_changed':
        return `${actor} changed when ${poll(r)} closes`
      case 'poll.option_added':
        return `${actor} added ${option(r)} to ${poll(r)}`
      case 'poll.voted':
        return `${actor} voted on ${poll(r)}`
      case 'poll.vote_changed':
        return `${actor} changed their vote on ${poll(r)}`
      case 'run.created':
        return `${actor} started ${run(r.runId)}`
      case 'run.renamed':
        return `${actor} renamed ${run(r.runId)}`
      case 'run.date_set':
        return `${actor} set a date for ${run(r.runId)}`
      case 'run.point_person_changed':
        return `${actor} made ${member(r)} the point person for ${run(r.runId)}`
      case 'run.item_added':
        return `${actor} added ${items(ofKind('run.item_added'))} to ${run(r.runId)}`
      case 'run.item_moved':
        return `${actor} moved ${items(ofKind('run.item_moved'))} to ${run(r.toRunId)}`
      case 'run.item_returned':
        return `${actor} put ${items(ofKind('run.item_returned'))} back in the pool`
      case 'run.item_done':
        return `${actor} checked off ${items(ofKind('run.item_done'))} on ${run(r.runId)}`
      case 'request.sent':
        return `${actor} sent ${run(r.runId)} to ${contact(r)}`
      case 'request.closed':
        return `${run(r.runId)} is all sorted`
      case 'run.finished':
        return `${actor} finished ${run(r.runId)}`
      case 'cost.added': {
        const amount = (r.costId && names.cost?.(r.costId)) || 'a cost'
        const forWhat = r.runId ? ` for ${run(r.runId)}` : r.itemId ? ` for ${item(r)}` : ''
        return `${actor} added ${amount}${forWhat}`
      }
      case 'cost.edited':
        return `${actor} edited a cost`
      case 'cost.removed':
        return `${actor} removed a cost`
      case 'house.created':
        return `${actor} set up the house`
      case 'settings.feeling_weights_changed':
        return `${actor} ${describeWeightsChange(r.changes as FieldChanges | undefined)}`
      case 'invite.created':
        return `${actor} made an invite link`
      case 'invite.revoked':
        return `${actor} turned off an invite link`
      case 'member.joined':
        return `${member(r)} joined the house`
      case 'member.room_changed':
        return `${member(r)} moved into ${room(r)}`
      case 'member.role_changed':
        return change(r, 'role')?.[1] === 'admin'
          ? `${actor} made ${member(r)} an admin`
          : `${actor} made ${member(r)} a member`
      case 'member.moved_out':
        return `${member(r)} moved out`
      case 'member.removed':
        return `${actor} removed ${member(r)} from the house`
      case 'contact.created':
        return `${actor} added ${contact(r)} to contacts`
      case 'contact.edited':
        return `${actor} updated ${contact(r)}`
      case 'contact.removed':
        return `${actor} removed ${contact(r)} from contacts`
      case 'room.added':
        return `${actor} added ${room(r)}`
      case 'room.renamed': {
        const before = change(r, 'name')?.[0]
        return typeof before === 'string'
          ? `${actor} renamed ${before} to ${room(r)}`
          : `${actor} renamed ${room(r)}`
      }
      case 'room.archived':
        return `${actor} archived ${room(r)}`
      default:
        return `${actor} made a change`
    }
  })()

  return { actionId: first.actionId, id: newest.id, at: newest.at, actorId: first.actorId, text }
}

/** The feed: one line per action, newest first, hidden kinds left out. */
export const activityFeed = (
  rows: readonly StoredActivityRow[],
  names: ActivityNames,
  viewer: { readonly isAdmin: boolean },
): FeedLine[] =>
  groupByAction(rows)
    .map((g) => activityLine(g, names, viewer))
    .filter((l): l is FeedLine => l !== null)

/**
 * Keyset pagination that never splits an action across pages: takes `limit` rows (newest first),
 * then keeps going while the next row belongs to the last row's action.
 */
export const pageAtActionBoundary = (
  rows: readonly StoredActivityRow[],
  limit: number,
): { rows: StoredActivityRow[]; before: number | null } => {
  if (rows.length <= limit) return { rows: [...rows], before: null }
  let end = limit
  const lastAction = rows[limit - 1]!.actionId
  while (end < rows.length && rows[end]!.actionId === lastAction) end++
  if (end >= rows.length) return { rows: [...rows], before: null }
  return { rows: rows.slice(0, end), before: rows[end - 1]!.id }
}
