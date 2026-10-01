// Reading the activity log back as feed lines (ARCHITECTURE §6.4, FRONTEND §7). Pure: names come
// from a lookup, and nothing here knows about the database.

import { FEELING_META, type FeelingKind } from './feelings'
import { dayHeading, feedTime } from './format'
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
import type { Category } from './items'
import { formatCents, type Cents } from './money'
import { runLabel, type RunRef } from './runs'
import { localDateOf, type Instant, type LocalDate } from './time'
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

/**
 * The names of what a page of activity points at, fetched with the page itself, so labelling a
 * page costs no extra request however big the house's history gets.
 */
export type ActivitySubjects = {
  readonly items: Readonly<Record<string, { readonly title: string; readonly category: Category }>>
  readonly runs: Readonly<Record<string, RunRef>>
  readonly polls: Readonly<Record<string, string>>
  readonly options: Readonly<Record<string, string>>
  readonly costs: Readonly<Record<string, Cents>>
}

export const noSubjects: ActivitySubjects = {
  items: {},
  runs: {},
  polls: {},
  options: {},
  costs: {},
}

/** All the pages' subjects in one lookup. */
export const mergeSubjects = (pages: readonly ActivitySubjects[]): ActivitySubjects => ({
  items: Object.assign({}, ...pages.map((p) => p.items)),
  runs: Object.assign({}, ...pages.map((p) => p.runs)),
  polls: Object.assign({}, ...pages.map((p) => p.polls)),
  options: Object.assign({}, ...pages.map((p) => p.options)),
  costs: Object.assign({}, ...pages.map((p) => p.costs)),
})

/** The feed's names: the page's subjects, plus the house's people, contacts and rooms. */
export const activityNames = (
  s: ActivitySubjects,
  house: Pick<ActivityNames, 'person' | 'contact' | 'room'>,
): ActivityNames => ({
  person: house.person,
  contact: house.contact,
  room: house.room,
  item: (id) => s.items[id],
  run: (id) => {
    const r = s.runs[id]
    return r && runLabel(r, house)
  },
  poll: (id) => s.polls[id],
  option: (id) => s.options[id],
  cost: (id) => {
    const c = s.costs[id]
    return c === undefined ? undefined : formatCents(c)
  },
})

/** What a line is about, for its icon and the filters. `item` is several kinds at once. */
export type FeedTopic = Category | 'item' | 'poll' | 'run' | 'money' | 'house'

/** What tapping a line opens. */
export type FeedTarget =
  | { readonly kind: 'item'; readonly id: ItemId }
  | { readonly kind: 'run'; readonly id: RunId }
  | { readonly kind: 'poll'; readonly id: PollId }

export type FeedLine = {
  readonly actionId: ActionId
  /** The newest row's id and time: the line sits where its action last happened. */
  readonly id: number
  readonly at: Instant
  readonly actorId: UserId | null
  readonly text: string
  readonly topic: FeedTopic
  /** Absent when there's nothing to open (people, rooms, settings, or several items at once). */
  readonly target?: FeedTarget
  /** A second line from what the rows already hold: a feeling's note, what an edit changed. */
  readonly detail?: string
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

/** Edited fields, in words ("Changed the date and priority"). The title says what it was. */
const EDIT_WORDS: Readonly<Record<string, string>> = {
  note: 'note',
  room: 'room',
  when: 'date',
  priority: 'priority',
  repeat_days: 'how often',
}

const listOf = (words: readonly string[]) =>
  words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`

const describeEdit = (changes: FieldChanges | undefined): string | undefined => {
  if (!changes) return undefined
  const parts: string[] = []
  const before = (changes as Record<string, readonly unknown[]>).title?.[0]
  if (typeof before === 'string') parts.push(`Was “${before}”`)
  const rest = Object.keys(changes).flatMap((k) => (EDIT_WORDS[k] ? [EDIT_WORDS[k]!] : []))
  if (rest.length) parts.push(`Changed the ${listOf(rest)}`)
  return parts.join(' · ') || undefined
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
        // The emoji, as everywhere else in the app (owner, 2026-10-01).
        const next = (r.changes as { next?: { kind?: FeelingKind } } | undefined)?.next?.kind
        return next
          ? `${actor} felt ${FEELING_META[next].emoji} about ${item(r)}`
          : `${actor} shared a feeling about ${item(r)}`
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

  // What it's about, and what a tap opens. Bulk lines about several items open nothing.
  const firstItems = ofKind(first.kind)
  const itemCats = new Set(
    firstItems.map((r) => (r.itemId && names.item?.(r.itemId)?.category) || 'item'),
  )
  const topic: FeedTopic = (() => {
    const k = first.kind
    if (k.startsWith('poll.')) return 'poll'
    if (k.startsWith('run.') || k.startsWith('request.')) return 'run'
    if (k.startsWith('cost.')) return 'money'
    if (k.startsWith('item.') || k === 'chore.done' || k === 'feeling.set')
      return itemCats.size === 1 ? ([...itemCats][0] as FeedTopic) : 'item'
    return 'house'
  })()
  const known = {
    item: (id?: ItemId): FeedTarget | undefined =>
      id && names.item?.(id) ? { kind: 'item', id } : undefined,
    run: (id?: RunId): FeedTarget | undefined =>
      id && names.run?.(id) ? { kind: 'run', id } : undefined,
    poll: (id?: PollId): FeedTarget | undefined =>
      id && names.poll?.(id) ? { kind: 'poll', id } : undefined,
  }
  const target: FeedTarget | undefined = (() => {
    const r = first
    if (topic === 'poll') return known.poll(r.pollId)
    if (topic === 'run') return known.run(r.kind === 'run.item_moved' ? r.toRunId : r.runId)
    if (topic === 'money') return known.run(r.runId) ?? known.item(r.itemId)
    if (topic !== 'house') return firstItems.length === 1 ? known.item(r.itemId) : undefined
    return undefined
  })()

  const quoted = (note: string | undefined) => (note ? `“${note}”` : undefined)
  const detail = (() => {
    if (first.kind === 'item.edited') return describeEdit(first.changes as FieldChanges | undefined)
    if (first.kind === 'feeling.set')
      return quoted((first.changes as { next?: { note?: string } } | undefined)?.next?.note)
    if (first.kind === 'run.finished') {
      const cost = rows.find((r) => r.kind === 'cost.added' && r.costId)
      const amount = cost?.costId && names.cost?.(cost.costId)
      if (amount) return `Spent ${amount}`
    }
    return quoted(first.note)
  })()

  return {
    actionId: first.actionId,
    id: newest.id,
    at: newest.at,
    actorId: first.actorId,
    text,
    topic,
    ...(target && { target }),
    ...(detail && { detail }),
  }
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

/** The Activity tab's filter chips. */
export type ActivityFilter = 'all' | 'items' | 'plans' | 'money' | 'house'

export const ACTIVITY_FILTERS: readonly { value: ActivityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'items', label: 'Items' },
  { value: 'plans', label: 'Polls & runs' },
  { value: 'money', label: 'Money' },
  { value: 'house', label: 'House' },
]

const FILTER_OF: Readonly<Record<FeedTopic, ActivityFilter>> = {
  need: 'items',
  chore: 'items',
  task: 'items',
  item: 'items',
  poll: 'plans',
  run: 'plans',
  money: 'money',
  house: 'house',
}

export const inActivityFilter = (line: FeedLine, filter: ActivityFilter): boolean =>
  filter === 'all' || FILTER_OF[line.topic] === filter

/** Lines under day headings ("Today", "Yesterday", "Mon, Sep 28"), with each line's time. */
export type FeedDay = {
  readonly date: LocalDate
  readonly heading: string
  readonly lines: readonly (FeedLine & { readonly time: string })[]
}

export const feedByDay = (lines: readonly FeedLine[], now: Instant, tz: string): FeedDay[] => {
  const days: { date: LocalDate; heading: string; lines: (FeedLine & { time: string })[] }[] = []
  for (const line of lines) {
    const date = localDateOf(line.at, tz)
    let day = days.at(-1)
    if (day?.date !== date) {
      day = { date, heading: dayHeading(date, now, tz), lines: [] }
      days.push(day)
    }
    day.lines.push({ ...line, time: feedTime(line.at, now, tz) })
  }
  return days
}

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
