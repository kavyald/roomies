// Domain events: returned by domain functions, recorded by the EventSink in the same transaction
// (ARCHITECTURE §6.3–6.4). The union is the whole catalog, including kinds whose features come later.

import type {
  ActionId,
  ContactId,
  CostId,
  HouseId,
  ItemId,
  OptionId,
  PollId,
  RoomId,
  RunId,
  UserId,
} from './ids'
import type { Feeling } from './feelings'
import type { Instant } from './time'

export type FieldChanges = Readonly<Record<string, readonly [before: unknown, after: unknown]>>

type EventBase = { readonly actionId: ActionId; readonly by: UserId | null } // by: null = Roomies (jobs)

export type DomainEvent = EventBase &
  // items
  (
    | {
        readonly kind:
          'item.created' | 'item.done' | 'item.reopened' | 'item.archived' | 'item.restored'
        readonly itemId: ItemId
        readonly runId?: RunId
      }
    | {
        /** `changes.lastDone`: [before, after], so Undo can put back the one before. */
        readonly kind: 'chore.done' | 'chore.undone'
        readonly itemId: ItemId
        readonly runId?: RunId
        readonly changes: FieldChanges
      }
    | { readonly kind: 'item.edited'; readonly itemId: ItemId; readonly changes: FieldChanges }
    | {
        readonly kind: 'item.assigned'
        readonly itemId: ItemId
        readonly memberId: UserId | null
        readonly changes: FieldChanges
      }
    | {
        readonly kind: 'item.handled_by_changed'
        readonly itemId: ItemId
        readonly contactId: ContactId | null
        readonly changes: FieldChanges
      }
    // feelings
    | {
        readonly kind: 'feeling.set'
        readonly itemId: ItemId
        readonly changes: { readonly previous: Feeling | null; readonly next: Feeling }
      }
    | {
        readonly kind: 'feeling.removed'
        readonly itemId: ItemId
        readonly changes: { readonly previous: Feeling }
      }
    // polls
    | {
        readonly kind: 'poll.created' | 'poll.reopened' | 'poll.vote_withdrawn'
        readonly pollId: PollId
        readonly itemId?: ItemId
      }
    | {
        readonly kind: 'poll.option_added' | 'poll.voted'
        readonly pollId: PollId
        readonly optionId: OptionId
        readonly note?: string
      }
    | {
        readonly kind: 'poll.vote_changed' | 'poll.deadline_changed'
        readonly pollId: PollId
        readonly optionId?: OptionId
        readonly changes: FieldChanges
      }
    | {
        readonly kind: 'poll.closed'
        readonly pollId: PollId
        readonly optionId?: OptionId
        readonly payload: { readonly result: 'winner' | 'tie' | 'no_votes' }
      }
    // runs (one event per item; a bulk action shares one actionId)
    | {
        readonly kind: 'run.created' | 'request.closed'
        readonly runId: RunId
        readonly contactId?: ContactId
      }
    | {
        readonly kind: 'run.item_added' | 'run.item_done'
        readonly runId: RunId
        readonly itemId: ItemId
      }
    | {
        readonly kind: 'run.item_returned'
        readonly runId: RunId
        readonly itemId: ItemId
        readonly note: string
      }
    | {
        readonly kind: 'run.item_moved'
        readonly runId: RunId
        readonly toRunId: RunId
        readonly itemId: ItemId
        readonly note?: string
      }
    | {
        readonly kind: 'run.renamed' | 'run.date_set'
        readonly runId: RunId
        readonly changes: FieldChanges
      }
    | {
        readonly kind: 'run.point_person_changed'
        readonly runId: RunId
        readonly memberId: UserId
        readonly changes: FieldChanges
      }
    | {
        readonly kind: 'request.sent'
        readonly runId: RunId
        readonly contactId: ContactId
        readonly payload: { readonly via: string; readonly message: string }
      }
    | {
        readonly kind: 'run.finished'
        readonly runId: RunId
        readonly payload: { readonly done: number; readonly returned: number }
      }
    // money
    | {
        readonly kind: 'cost.added' | 'cost.splitwise_copied'
        readonly costId: CostId
        readonly itemId?: ItemId
        readonly runId?: RunId
        readonly memberId?: UserId
      }
    | {
        readonly kind: 'cost.edited'
        readonly costId: CostId
        readonly itemId?: ItemId
        readonly runId?: RunId
        readonly memberId?: UserId
        readonly changes: FieldChanges
      }
    | {
        readonly kind: 'cost.removed'
        readonly costId: CostId
        readonly itemId?: ItemId
        readonly runId?: RunId
        readonly memberId?: UserId
        readonly note?: string
      }
    // house, people, places
    | { readonly kind: 'house.created' }
    | { readonly kind: 'settings.feeling_weights_changed'; readonly changes: FieldChanges }
    | {
        readonly kind: 'member.joined' | 'member.room_changed'
        readonly memberId: UserId
        readonly roomId?: RoomId
        readonly changes?: FieldChanges
      }
    | {
        readonly kind: 'member.role_changed' | 'member.moved_out' | 'member.removed'
        readonly memberId: UserId
        readonly note?: string
        readonly changes?: FieldChanges
      }
    | {
        readonly kind: 'invite.created' | 'invite.revoked'
        readonly payload: { readonly expiresAt?: string; readonly maxUses?: number }
      }
    | {
        readonly kind: 'contact.created' | 'contact.edited' | 'contact.removed'
        readonly contactId: ContactId
        readonly changes?: FieldChanges
      }
    | {
        readonly kind: 'room.renamed'
        readonly roomId: RoomId
        readonly changes?: FieldChanges
      }
  )

export type EventKind = DomainEvent['kind']

/** One `activity_events` row, before the database gives it an id. */
export type ActivityRow = {
  readonly houseId: HouseId
  readonly at: Instant
  readonly actorId: UserId | null
  readonly actionId: ActionId
  readonly kind: EventKind
  readonly itemId?: ItemId
  readonly runId?: RunId
  readonly toRunId?: RunId
  readonly pollId?: PollId
  readonly optionId?: OptionId
  readonly costId?: CostId
  readonly contactId?: ContactId
  readonly memberId?: UserId
  readonly roomId?: RoomId
  readonly note?: string
  readonly changes?: unknown
  readonly payload: Readonly<{ v: 1 } & Record<string, unknown>>
}

/** A stored row; `id` is the order events happened in. */
export type StoredActivityRow = ActivityRow & { readonly id: number }

const SUBJECTS = [
  'itemId',
  'runId',
  'toRunId',
  'pollId',
  'optionId',
  'costId',
  'contactId',
  'memberId',
  'roomId',
] as const

/** Maps an event to its activity row. Subjects become typed columns; `payload` holds extras only. */
export const activityRowFor = (e: DomainEvent, houseId: HouseId, at: Instant): ActivityRow => {
  const fields = e as unknown as Readonly<Record<string, unknown>>
  const row: Record<string, unknown> = {
    houseId,
    at,
    actorId: e.by,
    actionId: e.actionId,
    kind: e.kind,
    payload: { v: 1, ...(fields.payload as object | undefined) },
  }
  for (const k of SUBJECTS) if (fields[k] != null) row[k] = fields[k]
  if (typeof fields.note === 'string' && fields.note !== '') row.note = fields.note
  if (fields.changes != null) row.changes = fields.changes
  return row as ActivityRow
}
