// In-memory UnitOfWork (ARCHITECTURE §4.1 rule 5). Each transaction works on a copy of the state
// and swaps it in on commit. Access rules mirror the RLS policies in supabase/migrations, so a use
// case that reaches across houses fails here the same way it fails in Postgres.

import { AccessDenied, type Repos, type UnitOfWork } from '../../app/ports'
import type { Actor } from '../../domain/actor'
import { activityRowFor, type StoredActivityRow } from '../../domain/events'
import type { Contact, House, Invite, Member, Profile, Room } from '../../domain/house'
import type { ContactId, HouseId, InviteId, RoomId, UserId } from '../../domain/ids'

export type MemoryState = {
  users: Map<UserId, { email: string }>
  houses: Map<HouseId, House>
  profiles: Map<UserId, Profile>
  members: Map<string, Member>
  rooms: Map<RoomId, Room>
  contacts: Map<ContactId, Contact>
  invites: Map<InviteId, Invite>
  activity: StoredActivityRow[]
}

export const emptyState = (): MemoryState => ({
  users: new Map(),
  houses: new Map(),
  profiles: new Map(),
  members: new Map(),
  rooms: new Map(),
  contacts: new Map(),
  invites: new Map(),
  activity: [],
})

const memberKey = (houseId: HouseId, userId: UserId) => `${houseId}|${userId}`

// ---- access rules (keep in sync with the RLS policies) -----------------------------

const uid = (a: Actor): UserId | null => (a.kind === 'member' ? a.userId : null)

const membership = (s: MemoryState, a: Actor, houseId: HouseId) => {
  const u = uid(a)
  const m = u ? s.members.get(memberKey(houseId, u)) : undefined
  return m?.status.active ? m : undefined
}

export const isMember = (s: MemoryState, a: Actor, houseId: HouseId): boolean =>
  a.kind === 'system' || membership(s, a, houseId) !== undefined

export const isAdmin = (s: MemoryState, a: Actor, houseId: HouseId): boolean =>
  a.kind === 'system' || membership(s, a, houseId)?.role === 'admin'

const sharesAHouse = (s: MemoryState, a: Actor, other: UserId): boolean => {
  const me = uid(a)
  if (!me) return true
  if (me === other) return true
  return [...s.members.values()].some(
    (m) => m.userId === other && m.status.active && isMember(s, a, m.houseId),
  )
}

const deny = (what: string): never => {
  throw new AccessDenied(`Not allowed to write ${what}`)
}

/** Whether a resolved value is a failed Result, which rolls the transaction back. */
export const isFailedResult = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && 'ok' in v && (v as { ok: unknown }).ok === false

// ---- repos over one transaction's working copy ------------------------------------

const reposFor = (s: MemoryState, a: Actor): Repos => {
  const visible = <T extends { houseId: HouseId }>(rows: Iterable<T>, houseId: HouseId) =>
    [...rows].filter((r) => r.houseId === houseId && isMember(s, a, houseId))

  return {
    houses: {
      get: async (id) => (s.houses.has(id) && isMember(s, a, id) ? s.houses.get(id) : undefined),
      any: async () => [...s.houses.keys()].some((id) => isMember(s, a, id)),
      save: async (house) => {
        const exists = s.houses.has(house.id)
        const allowed = exists
          ? isAdmin(s, a, house.id)
          : a.kind === 'system' || (s.houses.size === 0 && house.createdBy === uid(a))
        if (!allowed) deny('houses')
        s.houses.set(house.id, house)
      },
    },
    profiles: {
      get: async (id) => (sharesAHouse(s, a, id) ? s.profiles.get(id) : undefined),
      save: async (p) => {
        if (a.kind !== 'system' && p.id !== uid(a)) deny('profiles')
        s.profiles.set(p.id, p)
      },
    },
    members: {
      get: async (houseId, userId) => {
        const m = s.members.get(memberKey(houseId, userId))
        return m && (isMember(s, a, houseId) || userId === uid(a)) ? m : undefined
      },
      listByHouse: async (houseId) => visible(s.members.values(), houseId),
      save: async (m) => {
        if (!isAdmin(s, a, m.houseId)) deny('house_members')
        s.members.set(memberKey(m.houseId, m.userId), m)
      },
    },
    rooms: {
      get: async (id) => {
        const r = s.rooms.get(id)
        return r && isMember(s, a, r.houseId) ? r : undefined
      },
      listByHouse: async (houseId) =>
        visible(s.rooms.values(), houseId).sort((x, y) => x.sortOrder - y.sortOrder),
      save: async (r) => {
        const old = s.rooms.get(r.id)
        if (!isMember(s, a, r.houseId) || (old && !isMember(s, a, old.houseId))) deny('rooms')
        s.rooms.set(r.id, r)
      },
    },
    contacts: {
      get: async (id) => {
        const c = s.contacts.get(id)
        return c && isMember(s, a, c.houseId) ? c : undefined
      },
      listByHouse: async (houseId) =>
        visible(s.contacts.values(), houseId).sort((x, y) => x.name.localeCompare(y.name)),
      save: async (c) => {
        const old = s.contacts.get(c.id)
        if (!isMember(s, a, c.houseId) || (old && !isMember(s, a, old.houseId))) deny('contacts')
        s.contacts.set(c.id, c)
      },
    },
    invites: {
      get: async (id) => {
        const i = s.invites.get(id)
        return i && isAdmin(s, a, i.houseId) ? i : undefined
      },
      findByTokenHash: async (hash) =>
        [...s.invites.values()].find((i) => i.tokenHash === hash && isAdmin(s, a, i.houseId)),
      save: async (i) => {
        const old = s.invites.get(i.id)
        if (!isAdmin(s, a, i.houseId) || (old && !isAdmin(s, a, old.houseId))) deny('house_invites')
        s.invites.set(i.id, i)
      },
    },
    events: {
      record: async (houseId, events, at) => {
        for (const e of events) {
          if (!isMember(s, a, houseId) || (a.kind === 'member' && e.by !== a.userId)) {
            deny('activity_events')
          }
          const id = (s.activity.at(-1)?.id ?? 0) + 1
          s.activity.push({ ...activityRowFor(e, houseId, at), id })
        }
      },
    },
  }
}

// ---- the unit of work ---------------------------------------------------------------

export class MemoryUnitOfWork implements UnitOfWork {
  state: MemoryState = emptyState()
  private queue: Promise<unknown> = Promise.resolve()

  run<T>(actor: Actor, fn: (repos: Repos) => Promise<T>): Promise<T> {
    // One transaction at a time, like serializable isolation.
    const next = this.queue.then(async () => {
      const working = structuredClone(this.state)
      const result = await fn(reposFor(working, actor))
      if (!isFailedResult(result)) this.state = working
      return result
    })
    this.queue = next.catch(() => undefined)
    return next
  }

  /** Auth users live outside the app tables (Supabase Auth owns them in production). */
  addUser(id: UserId, email: string): void {
    this.state.users.set(id, { email })
  }
}
