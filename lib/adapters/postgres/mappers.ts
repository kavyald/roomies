// Row ↔ domain mappers (ARCHITECTURE §4.1 rule 3). Nulls become absent optional fields.

import type { Selectable } from 'kysely'
import type { StoredActivityRow } from '../../domain/events'
import { feelingWeightsFrom, type Feeling } from '../../domain/feelings'
import type { Contact, House, Invite, Member, Profile, Room } from '../../domain/house'
import { asId } from '../../domain/ids'
import type { Done, Item } from '../../domain/items'
import type { Poll, PollOption } from '../../domain/polls'
import type { Run } from '../../domain/runs'
import {
  instant,
  instantOfWhen,
  localDateOf,
  localTimeOf,
  type Instant,
  type LocalTime,
  type When,
} from '../../domain/time'
import type {
  ActivityEventsTable,
  ContactsTable,
  FeelingsTable,
  HouseInvitesTable,
  HouseMembersTable,
  HousesTable,
  ItemsTable,
  ProfilesTable,
  PollOptionsTable,
  PollsTable,
  PollVotesTable,
  RoomsTable,
  RunsTable,
} from './schema'

export const toInstant = (d: Date | string): Instant => instant(new Date(d).getTime())
export const toDate = (i: Instant): Date => new Date(i.epochMs)
const optInstant = (d: Date | string | null) => (d === null ? undefined : toInstant(d))

/** Drops keys whose value is undefined, so optional fields are absent rather than undefined. */
const compact = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

// ---- profiles --------------------------------------------------------------------------

export const profileToDomain = (r: Selectable<ProfilesTable>): Profile =>
  compact({
    id: asId<'user'>(r.id),
    displayName: r.display_name,
    theme: r.theme,
    timezone: r.timezone ?? undefined,
    quietHours:
      r.quiet_start && r.quiet_end
        ? {
            start: r.quiet_start.slice(0, 5) as LocalTime,
            end: r.quiet_end.slice(0, 5) as LocalTime,
          }
        : undefined,
    createdAt: toInstant(r.created_at),
  })

export const profileToRow = (p: Profile) => ({
  id: p.id,
  display_name: p.displayName,
  theme: p.theme,
  timezone: p.timezone ?? null,
  quiet_start: p.quietHours?.start ?? null,
  quiet_end: p.quietHours?.end ?? null,
  created_at: toDate(p.createdAt),
})

// ---- houses ------------------------------------------------------------------------------

export const houseToDomain = (r: Selectable<HousesTable>): House =>
  compact({
    id: asId<'house'>(r.id),
    name: r.name,
    address: r.address ?? undefined,
    unit: r.unit ?? undefined,
    settings: {
      timezone: r.settings.timezone,
      feelingWeights: feelingWeightsFrom(r.settings.feeling_weights),
      inviteTtlDays: r.settings.invite_ttl_days,
    },
    createdBy: asId<'user'>(r.created_by),
    createdAt: toInstant(r.created_at),
  })

export const houseToRow = (h: House) => ({
  id: h.id,
  name: h.name,
  address: h.address ?? null,
  unit: h.unit ?? null,
  created_by: h.createdBy,
  created_at: toDate(h.createdAt),
  settings: JSON.stringify({
    timezone: h.settings.timezone,
    feeling_weights: h.settings.feelingWeights,
    invite_ttl_days: h.settings.inviteTtlDays,
  }),
})

// ---- members -------------------------------------------------------------------------------

export const memberToDomain = (r: Selectable<HouseMembersTable>): Member =>
  compact({
    houseId: asId<'house'>(r.house_id),
    userId: asId<'user'>(r.user_id),
    role: r.role,
    roomId: r.room_id ? asId<'room'>(r.room_id) : undefined,
    joinedAt: toInstant(r.joined_at),
    status:
      r.status === 'active' || r.left_at === null
        ? ({ active: true } as const)
        : ({ active: false, leftAt: toInstant(r.left_at) } as const),
  })

export const memberToRow = (m: Member) => ({
  house_id: m.houseId,
  user_id: m.userId,
  role: m.role,
  status: m.status.active ? ('active' as const) : ('moved_out' as const),
  room_id: m.roomId ?? null,
  joined_at: toDate(m.joinedAt),
  left_at: m.status.active ? null : toDate(m.status.leftAt),
})

// ---- rooms -----------------------------------------------------------------------------------

export const roomToDomain = (r: Selectable<RoomsTable>): Room =>
  compact({
    id: asId<'room'>(r.id),
    houseId: asId<'house'>(r.house_id),
    name: r.name,
    floor: r.floor,
    kind: r.kind,
    element: r.element ?? undefined,
    sortOrder: r.sort_order,
    archivedAt: optInstant(r.archived_at),
  })

export const roomToRow = (r: Room) => ({
  id: r.id,
  house_id: r.houseId,
  name: r.name,
  floor: r.floor,
  kind: r.kind,
  element: r.element ?? null,
  sort_order: r.sortOrder,
  archived_at: r.archivedAt ? toDate(r.archivedAt) : null,
})

// ---- contacts --------------------------------------------------------------------------------

export const contactToDomain = (r: Selectable<ContactsTable>): Contact =>
  compact({
    id: asId<'contact'>(r.id),
    houseId: asId<'house'>(r.house_id),
    name: r.name,
    phone: r.phone ?? undefined,
    note: r.note ?? undefined,
    archivedAt: optInstant(r.archived_at),
  })

export const contactToRow = (c: Contact) => ({
  id: c.id,
  house_id: c.houseId,
  name: c.name,
  phone: c.phone ?? null,
  note: c.note ?? null,
  archived_at: c.archivedAt ? toDate(c.archivedAt) : null,
})

// ---- invites ---------------------------------------------------------------------------------

export const inviteToDomain = (r: Selectable<HouseInvitesTable>): Invite =>
  compact({
    id: asId<'invite'>(r.id),
    houseId: asId<'house'>(r.house_id),
    tokenHash: r.token_hash,
    createdBy: asId<'user'>(r.created_by),
    expiresAt: toInstant(r.expires_at),
    maxUses: r.max_uses,
    uses: r.uses,
    revokedAt: optInstant(r.revoked_at),
  })

export const inviteToRow = (i: Invite) => ({
  id: i.id,
  house_id: i.houseId,
  token_hash: i.tokenHash,
  created_by: i.createdBy,
  expires_at: toDate(i.expiresAt),
  max_uses: i.maxUses,
  uses: i.uses,
  revoked_at: i.revokedAt ? toDate(i.revokedAt) : null,
})

// ---- activity ----------------------------------------------------------------------------------

export const activityToDomain = (r: Selectable<ActivityEventsTable>): StoredActivityRow =>
  compact({
    id: Number(r.id),
    houseId: asId<'house'>(r.house_id),
    at: toInstant(r.at),
    actorId: r.actor_id === null ? null : asId<'user'>(r.actor_id),
    actionId: asId<'action'>(r.action_id),
    kind: r.kind as StoredActivityRow['kind'],
    itemId: r.item_id ? asId<'item'>(r.item_id) : undefined,
    runId: r.run_id ? asId<'run'>(r.run_id) : undefined,
    toRunId: r.to_run_id ? asId<'run'>(r.to_run_id) : undefined,
    pollId: r.poll_id ? asId<'poll'>(r.poll_id) : undefined,
    optionId: r.option_id ? asId<'option'>(r.option_id) : undefined,
    costId: r.cost_id ? asId<'cost'>(r.cost_id) : undefined,
    contactId: r.contact_id ? asId<'contact'>(r.contact_id) : undefined,
    memberId: r.member_id ? asId<'user'>(r.member_id) : undefined,
    roomId: r.room_id ? asId<'room'>(r.room_id) : undefined,
    note: r.note ?? undefined,
    changes: r.changes ?? undefined,
    payload: r.payload as StoredActivityRow['payload'],
  })

// ---- items -------------------------------------------------------------------------------------
// `when` is stored as an instant plus "has a time"; a date alone is the start of that day in the
// house's time zone, so it reads back as the same date.

export const itemToDomain = (r: Selectable<ItemsTable>, tz: string): Item => {
  const when: When | undefined = r.when_at
    ? {
        date: localDateOf(toInstant(r.when_at), tz),
        ...(r.when_has_time && { time: localTimeOf(toInstant(r.when_at), tz) }),
      }
    : undefined
  const base = compact({
    id: asId<'item'>(r.id),
    houseId: asId<'house'>(r.house_id),
    title: r.title,
    note: r.note ?? undefined,
    roomId: r.room_id ? asId<'room'>(r.room_id) : undefined,
    assignee: r.assignee_id ? asId<'user'>(r.assignee_id) : undefined,
    when,
    priority: r.priority,
    run: r.run_id && r.run_kind ? { id: asId<'run'>(r.run_id), kind: r.run_kind } : undefined,
    createdBy: asId<'user'>(r.created_by),
    createdAt: toInstant(r.created_at),
    archivedAt: optInstant(r.archived_at),
  })
  const done =
    r.done_at && r.done_by ? { at: toInstant(r.done_at), by: asId<'user'>(r.done_by) } : undefined
  switch (r.category) {
    case 'chore':
      return compact({
        ...base,
        category: 'chore' as const,
        repeatDays: r.repeat_days,
        lastDone:
          r.last_done_at && r.last_done_by
            ? { at: toInstant(r.last_done_at), by: asId<'user'>(r.last_done_by) }
            : undefined,
      })
    case 'task':
      return compact({
        ...base,
        category: 'task' as const,
        contactId: r.contact_id ? asId<'contact'>(r.contact_id) : undefined,
        done,
      })
    default:
      return compact({ ...base, category: 'need' as const, done })
  }
}

export const itemToRow = (i: Item, tz: string) => {
  // Fields outside the item's category are read loosely, so a malformed object still reaches the
  // database, whose CHECKs refuse it.
  const loose = i as Item & {
    repeatDays?: number | null
    lastDone?: Done
    contactId?: string
    done?: Done
  }
  return {
    id: i.id,
    house_id: i.houseId,
    category: i.category,
    title: i.title,
    note: i.note ?? null,
    room_id: i.roomId ?? null,
    assignee_id: i.assignee ?? null,
    when_at: i.when ? toDate(instantOfWhen(i.when, tz)) : null,
    when_has_time: Boolean(i.when?.time),
    priority: i.priority,
    repeat_days: loose.repeatDays ?? null,
    last_done_at: loose.lastDone ? toDate(loose.lastDone.at) : null,
    last_done_by: loose.lastDone?.by ?? null,
    contact_id: loose.contactId ?? null,
    done_at: loose.done ? toDate(loose.done.at) : null,
    done_by: loose.done?.by ?? null,
    run_id: i.run?.id ?? null,
    run_kind: i.run?.kind ?? null,
    created_by: i.createdBy,
    created_at: toDate(i.createdAt),
    archived_at: i.archivedAt ? toDate(i.archivedAt) : null,
  }
}

// ---- polls --------------------------------------------------------------------------------------

export const pollToDomain = (
  r: Selectable<PollsTable>,
  options: readonly Selectable<PollOptionsTable>[],
  votes: readonly Selectable<PollVotesTable>[],
): Poll =>
  compact({
    id: asId<'poll'>(r.id),
    houseId: asId<'house'>(r.house_id),
    question: r.question,
    itemId: r.item_id ? asId<'item'>(r.item_id) : undefined,
    options: [...options]
      .filter((o) => o.poll_id === r.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) =>
        compact({
          id: asId<'option'>(o.id),
          label: o.label,
          note: o.note ?? undefined,
          addedBy: asId<'user'>(o.added_by),
          addedAt: toInstant(o.added_at),
        }),
      ),
    votes: votes
      .filter((v) => v.poll_id === r.id)
      .map((v) => ({
        user: asId<'user'>(v.user_id),
        option: asId<'option'>(v.option_id),
        at: toInstant(v.voted_at),
      })),
    closesAt: optInstant(r.closes_at),
    createdBy: asId<'user'>(r.created_by),
    createdAt: toInstant(r.created_at),
    state: r.closed_at
      ? { open: false as const, closedAt: toInstant(r.closed_at) }
      : { open: true as const },
  })

export const pollOptionToRow = (p: Poll, o: PollOption, sortOrder: number) => ({
  id: o.id,
  poll_id: p.id,
  house_id: p.houseId,
  label: o.label,
  note: o.note ?? null,
  added_by: o.addedBy,
  added_at: toDate(o.addedAt),
  sort_order: sortOrder,
})

// ---- runs ---------------------------------------------------------------------------------------

const whenOf = (at: Date | string | null, hasTime: boolean, tz: string): When | undefined =>
  at
    ? {
        date: localDateOf(toInstant(at), tz),
        ...(hasTime && { time: localTimeOf(toInstant(at), tz) }),
      }
    : undefined

export const runToDomain = (r: Selectable<RunsTable>, tz: string): Run => {
  const base = compact({
    id: asId<'run'>(r.id),
    houseId: asId<'house'>(r.house_id),
    title: r.title ?? undefined,
    runner: asId<'user'>(r.runner_id),
    createdBy: asId<'user'>(r.created_by),
    createdAt: toInstant(r.created_at),
  })
  const openOrFinished = r.finished_at
    ? { open: false as const, finishedAt: toInstant(r.finished_at) }
    : { open: true as const }
  switch (r.kind) {
    case 'batch':
      return compact({
        ...base,
        kind: 'batch' as const,
        when: whenOf(r.when_at, r.when_has_time, tz),
        state: openOrFinished,
      })
    case 'visit':
      return compact({
        ...base,
        kind: 'visit' as const,
        contactId: asId<'contact'>(r.contact_id!),
        when: whenOf(r.when_at, r.when_has_time, tz),
        state: openOrFinished,
      })
    case 'request':
      return {
        ...base,
        kind: 'request',
        contactId: asId<'contact'>(r.contact_id!),
        state:
          r.status === 'sent'
            ? { at: 'sent', sentAt: toInstant(r.sent_at!), via: r.sent_via! }
            : r.status === 'closed'
              ? { at: 'closed', closedAt: toInstant(r.finished_at!) }
              : { at: 'gathering' },
      }
  }
}

export const runToRow = (r: Run, tz: string) => {
  const when = r.kind === 'request' ? undefined : r.when
  const state = r.state
  return {
    id: r.id,
    house_id: r.houseId,
    kind: r.kind,
    title: r.title ?? null,
    runner_id: r.runner,
    contact_id: r.kind === 'batch' ? null : r.contactId,
    when_at: when ? toDate(instantOfWhen(when, tz)) : null,
    when_has_time: Boolean(when?.time),
    status: 'at' in state ? state.at : state.open ? ('open' as const) : ('finished' as const),
    sent_at: 'at' in state && state.at === 'sent' ? toDate(state.sentAt) : null,
    sent_via: 'at' in state && state.at === 'sent' ? state.via : null,
    finished_at:
      'at' in state
        ? state.at === 'closed'
          ? toDate(state.closedAt)
          : null
        : state.open
          ? null
          : toDate(state.finishedAt),
    created_by: r.createdBy,
    created_at: toDate(r.createdAt),
  }
}

// ---- feelings -----------------------------------------------------------------------------------

export const feelingToDomain = (r: Selectable<FeelingsTable>): Feeling =>
  compact({
    itemId: asId<'item'>(r.item_id),
    by: asId<'user'>(r.user_id),
    kind: r.kind,
    note: r.note ?? undefined,
    at: toInstant(r.updated_at),
  })

export const feelingToRow = (houseId: string, f: Feeling) => ({
  item_id: f.itemId,
  user_id: f.by,
  house_id: houseId,
  kind: f.kind,
  note: f.note ?? null,
  updated_at: toDate(f.at),
})
