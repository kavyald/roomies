// Row ↔ domain mappers (ARCHITECTURE §4.1 rule 3). Nulls become absent optional fields.

import type { Selectable } from 'kysely'
import type { StoredActivityRow } from '../../domain/events'
import type { FeelingWeights } from '../../domain/feelings'
import type { Contact, House, Invite, Member, Profile, Room } from '../../domain/house'
import { asId } from '../../domain/ids'
import { instant, type Instant, type LocalTime } from '../../domain/time'
import type {
  ActivityEventsTable,
  ContactsTable,
  HouseInvitesTable,
  HouseMembersTable,
  HousesTable,
  ProfilesTable,
  RoomsTable,
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
      feelingWeights: r.settings.feeling_weights as FeelingWeights,
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
