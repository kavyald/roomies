// In-memory UnitOfWork (ARCHITECTURE §4.1 rule 5). Each transaction works on a copy of the state
// and swaps it in on commit. Access rules mirror the RLS policies in supabase/migrations, so a use
// case that reaches across houses fails here the same way it fails in Postgres.

import { AccessDenied, ConstraintViolation, type Repos, type UnitOfWork } from '../../app/ports'
import type { Actor } from '../../domain/actor'
import { activityRowFor, type StoredActivityRow } from '../../domain/events'
import { isFailedResult } from '../../domain/result'
import type { Contact, House, Invite, Member, Profile, Room } from '../../domain/house'
import type {
  ContactId,
  HouseId,
  InviteId,
  ItemId,
  PollId,
  RoomId,
  RunId,
  UserId,
} from '../../domain/ids'
import type { Cost } from '../../domain/costs'
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type OutboxMessage,
} from '../../domain/notifications'
import type { PushSubscription } from '../../domain/push'
import type { Instant } from '../../domain/time'
import type { Poll, PollOption } from '../../domain/polls'
import type { Feeling } from '../../domain/feelings'
import { sameNeed, type Item, type Need } from '../../domain/items'
import type { Run } from '../../domain/runs'
import { isValidWeight } from '../../domain/weights'

export type MemoryState = {
  users: Map<UserId, { email: string }>
  houses: Map<HouseId, House>
  profiles: Map<UserId, Profile>
  members: Map<string, Member>
  rooms: Map<RoomId, Room>
  contacts: Map<ContactId, Contact>
  invites: Map<InviteId, Invite>
  items: Map<ItemId, Item>
  feelings: Map<string, { houseId: HouseId; feeling: Feeling }>
  runs: Map<RunId, Run>
  polls: Map<PollId, Poll>
  costs: Cost[]
  prefs: Map<string, boolean>
  outbox: (OutboxMessage & { id: number; sentAt?: Instant; error?: string })[]
  pushSubs: Map<string, PushSubscription>
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
  items: new Map(),
  feelings: new Map(),
  runs: new Map(),
  polls: new Map(),
  costs: [],
  prefs: new Map(),
  outbox: [],
  pushSubs: new Map(),
  activity: [],
})

const memberKey = (houseId: HouseId, userId: UserId) => `${houseId}|${userId}`

// ---- access rules (keep in sync with the RLS policies) -----------------------------

const uid = (a: Actor): UserId | null => (a.kind === 'system' ? null : a.userId)

const membership = (s: MemoryState, a: Actor, houseId: HouseId) => {
  const u = uid(a)
  const m = u ? s.members.get(memberKey(houseId, u)) : undefined
  return m?.status.active ? m : undefined
}

export const isMember = (s: MemoryState, a: Actor, houseId: HouseId): boolean =>
  a.kind === 'system' || membership(s, a, houseId) !== undefined

export const isAdmin = (s: MemoryState, a: Actor, houseId: HouseId): boolean =>
  a.kind === 'system' || membership(s, a, houseId)?.role === 'admin'

/** Everything but `settings.feelingWeights` is the same (policy "houses members set feeling weights"). */
const onlyFeelingWeightsChanged = (before: House, after: House): boolean => {
  const rest = (h: House) =>
    JSON.stringify([
      h.id,
      h.name,
      h.address ?? null,
      h.unit ?? null,
      h.createdBy,
      h.createdAt,
      { ...h.settings, feelingWeights: null },
    ])
  return rest(before) === rest(after)
}

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

// ---- repos over one transaction's working copy ------------------------------------

const reposFor = (s: MemoryState, a: Actor): Repos => {
  const visible = <T extends { houseId: HouseId }>(rows: Iterable<T>, houseId: HouseId) =>
    [...rows].filter((r) => r.houseId === houseId && isMember(s, a, houseId))

  return {
    houses: {
      get: async (id) => (s.houses.has(id) && isMember(s, a, id) ? s.houses.get(id) : undefined),
      any: async () => [...s.houses.keys()].some((id) => isMember(s, a, id)),
      setupAvailable: async () => s.houses.size === 0,
      save: async (house) => {
        const exists = s.houses.has(house.id)
        // Admins edit the house; any member may change just the feeling weights (migration
        // feeling_weights).
        const allowed = exists
          ? isAdmin(s, a, house.id) ||
            (isMember(s, a, house.id) && onlyFeelingWeightsChanged(s.houses.get(house.id)!, house))
          : a.kind === 'system' || (s.houses.size === 0 && house.createdBy === uid(a))
        if (!Object.values(house.settings.feelingWeights).every(isValidWeight))
          throw new ConstraintViolation('houses_feeling_weights_valid')
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
      listByHouse: async (houseId) =>
        [...s.members.values()].filter(
          (m) => m.houseId === houseId && (isMember(s, a, houseId) || m.userId === uid(a)),
        ),
      listForUser: async (userId) =>
        [...s.members.values()].filter(
          (m) => m.userId === userId && (isMember(s, a, m.houseId) || m.userId === uid(a)),
        ),
      save: async (m) => {
        // The house's creator may add themselves as its first admin (migration house_setup).
        const claimsNewHouse =
          m.userId === uid(a) &&
          m.role === 'admin' &&
          s.houses.get(m.houseId)?.createdBy === uid(a) &&
          ![...s.members.values()].some((x) => x.houseId === m.houseId)
        // An active member may update their own row, but not their role (migration
        // member_self_update).
        const current = s.members.get(memberKey(m.houseId, m.userId))
        const updatesSelf =
          m.userId === uid(a) && current?.status.active === true && current.role === m.role
        if (!isAdmin(s, a, m.houseId) && !claimsNewHouse && !updatesSelf) deny('house_members')
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
      listByHouse: async (houseId) =>
        [...s.invites.values()].filter((i) => i.houseId === houseId && isAdmin(s, a, houseId)),
      save: async (i) => {
        const old = s.invites.get(i.id)
        if (!isAdmin(s, a, i.houseId) || (old && !isAdmin(s, a, old.houseId))) deny('house_invites')
        s.invites.set(i.id, i)
      },
    },
    items: {
      get: async (id) => {
        const i = s.items.get(id)
        return i && isMember(s, a, i.houseId) ? i : undefined
      },
      listByHouse: async (houseId) => visible(s.items.values(), houseId),
      openNeeds: async (houseId) =>
        visible(s.items.values(), houseId).filter(
          (i): i is Need => i.category === 'need' && !i.done && !i.archivedAt,
        ),
      onRun: async (runId) =>
        [...s.items.values()].filter((i) => i.run?.id === runId && isMember(s, a, i.houseId)),
      save: async (item) => {
        const old = s.items.get(item.id)
        if (!isMember(s, a, item.houseId) || (old && !isMember(s, a, old.houseId))) deny('items')
        if (!old && a.kind !== 'system' && item.createdBy !== uid(a)) deny('items')
        checkItem(s, item)
        s.items.set(item.id, item)
      },
    },
    feelings: {
      get: async (itemId, userId) => {
        const f = s.feelings.get(`${itemId}|${userId}`)
        return f && isMember(s, a, f.houseId) ? f.feeling : undefined
      },
      save: async (houseId, feeling) => {
        const item = s.items.get(feeling.itemId)
        if (!isMember(s, a, houseId) || (a.kind !== 'system' && feeling.by !== uid(a)))
          deny('feelings')
        if (item?.houseId !== houseId) throw new ConstraintViolation('feelings: item not in house')
        s.feelings.set(`${feeling.itemId}|${feeling.by}`, { houseId, feeling })
      },
      remove: async (itemId, userId) => {
        const f = s.feelings.get(`${itemId}|${userId}`)
        if (!f) return
        if (!isMember(s, a, f.houseId) || (a.kind !== 'system' && userId !== uid(a)))
          deny('feelings')
        s.feelings.delete(`${itemId}|${userId}`)
      },
    },
    runs: {
      get: async (id) => {
        const r = s.runs.get(id)
        return r && isMember(s, a, r.houseId) ? r : undefined
      },
      listByHouse: async (houseId) => visible(s.runs.values(), houseId),
      save: async (run) => {
        const old = s.runs.get(run.id)
        if (!isMember(s, a, run.houseId) || (old && !isMember(s, a, old.houseId))) deny('runs')
        if (!old && a.kind !== 'system' && run.createdBy !== uid(a)) deny('runs')
        if (old && old.kind !== run.kind) throw new ConstraintViolation('runs: kind never changes')
        if (run.title !== undefined && !(run.title.trim() && run.title.trim().length <= 80))
          throw new ConstraintViolation('runs: title')
        s.runs.set(run.id, run)
      },
    },
    notifications: {
      offFor: async (userIds) => {
        const off = new Map<UserId, Set<NotificationCategory>>()
        for (const u of userIds) {
          // "notification prefs read": your own, or people you live with.
          if (a.kind !== 'system' && u !== uid(a) && !sharesAHouse(s, a, u)) continue
          const cats = NOTIFICATION_CATEGORIES.filter((c) => s.prefs.get(`${u}|${c}`) === false)
          if (cats.length) off.set(u, new Set(cats))
        }
        return off
      },
      setEnabled: async (userId, category, enabled) => {
        if (a.kind !== 'system' && userId !== uid(a)) deny('notification_prefs')
        s.prefs.set(`${userId}|${category}`, enabled)
      },
      enqueue: async (messages) => {
        for (const m of messages) {
          if (!isMember(s, a, m.houseId)) deny('notifications_outbox')
          s.outbox.push({ ...m, id: (s.outbox.at(-1)?.id ?? 0) + 1 })
        }
      },
      // "outbox read own": members see their own messages; marking sent is the system's job.
      pending: async (now, limit) =>
        s.outbox
          .filter((m) => !m.sentAt && m.sendAfter.epochMs <= now.epochMs)
          .filter((m) => a.kind === 'system' || m.userId === uid(a))
          .slice(0, limit)
          .map(({ sentAt: _s, error: _e, ...m }) => m),
      markSent: async (id, at, error) => {
        if (a.kind !== 'system') deny('notifications_outbox')
        const m = s.outbox.find((x) => x.id === id)
        if (m) {
          m.sentAt = at
          if (error) m.error = error
        }
      },
    },
    pushSubscriptions: {
      save: async (sub) => {
        if (a.kind !== 'system' && sub.userId !== uid(a)) deny('push_subscriptions')
        const same = [...s.pushSubs.values()].find((x) => x.endpoint === sub.endpoint)
        if (same && same.userId !== sub.userId) deny('push_subscriptions')
        if (same) {
          const { goneAt: _g, ...rest } = same
          s.pushSubs.set(same.id, {
            ...rest,
            keys: sub.keys,
            ...(sub.userAgent && { userAgent: sub.userAgent }),
          })
        } else s.pushSubs.set(sub.id, sub)
      },
      forUsers: async (userIds) =>
        [...s.pushSubs.values()].filter(
          (x) =>
            userIds.includes(x.userId) && !x.goneAt && (a.kind === 'system' || x.userId === uid(a)),
        ),
      markOk: async (id, at) => {
        const x = s.pushSubs.get(id)
        if (x && (a.kind === 'system' || x.userId === uid(a)))
          s.pushSubs.set(id, { ...x, lastOkAt: at })
      },
      markGone: async (id, at) => {
        const x = s.pushSubs.get(id)
        if (x && (a.kind === 'system' || x.userId === uid(a)))
          s.pushSubs.set(id, { ...x, goneAt: at })
      },
    },
    costs: {
      listByHouse: async (houseId) => visible(s.costs, houseId),
      add: async (cost) => {
        if (!isMember(s, a, cost.houseId)) deny('costs')
        if (a.kind !== 'system' && cost.createdBy !== uid(a)) deny('costs')
        if (s.costs.some((c) => c.id === cost.id)) deny('costs')
        if (!(cost.amount > 0 && cost.amount <= 10_000_000))
          throw new ConstraintViolation('costs: amount')
        const f = cost.for
        if (f && 'item' in f && s.items.get(f.item)?.houseId !== cost.houseId)
          throw new ConstraintViolation('costs: item not in house')
        if (f && 'run' in f && !s.runs.has(f.run))
          throw new ConstraintViolation('costs: no such run')
        s.costs.push(cost)
      },
    },
    polls: {
      get: async (id) => {
        const p = s.polls.get(id)
        return p && isMember(s, a, p.houseId) ? p : undefined
      },
      listByHouse: async (houseId) => visible(s.polls.values(), houseId),
      create: async (poll) => {
        if (!isMember(s, a, poll.houseId)) deny('polls')
        if (a.kind !== 'system' && poll.createdBy !== uid(a)) deny('polls')
        if (s.polls.has(poll.id)) deny('polls')
        if (poll.itemId && s.items.get(poll.itemId)?.houseId !== poll.houseId)
          throw new ConstraintViolation('polls: item not in house')
        poll.options.forEach((o, i) => checkOption(poll.options.slice(0, i), o))
        s.polls.set(poll.id, { ...poll, votes: [] })
      },
      addOption: async (poll, option) => {
        const stored = s.polls.get(poll.id)
        if (!stored || !isMember(s, a, stored.houseId)) deny('poll_options')
        if (a.kind !== 'system' && option.addedBy !== uid(a)) deny('poll_options')
        if (!stored!.state.open) deny('poll_options') // "poll options add while open"
        checkOption(stored!.options, option)
        s.polls.set(poll.id, { ...stored!, options: [...stored!.options, option] })
      },
      setVote: async (poll, vote) => {
        const stored = s.polls.get(poll.id)
        if (!stored || !isMember(s, a, stored.houseId)) deny('poll_votes')
        if (a.kind !== 'system' && vote.user !== uid(a)) deny('poll_votes')
        if (!stored!.state.open) deny('poll_votes')
        if (!stored!.options.some((o) => o.id === vote.option))
          throw new ConstraintViolation('poll_votes: option not in poll')
        s.polls.set(poll.id, {
          ...stored!,
          votes: [...stored!.votes.filter((v) => v.user !== vote.user), vote],
        })
      },
      saveState: async (poll) => {
        const stored = s.polls.get(poll.id)
        if (!stored || !isMember(s, a, stored.houseId)) deny('polls')
        s.polls.set(poll.id, {
          ...stored!,
          state: poll.state,
          ...(poll.closesAt ? { closesAt: poll.closesAt } : { closesAt: undefined }),
        })
      },
    },
    events: {
      forRun: async (houseId, runId) =>
        isMember(s, a, houseId)
          ? s.activity
              .filter((r) => r.houseId === houseId && (r.runId === runId || r.toRunId === runId))
              .sort((x, y) => x.id - y.id)
          : [],
      record: async (houseId, events, at) => {
        for (const e of events) {
          if (!isMember(s, a, houseId) || (a.kind !== 'system' && e.by !== a.userId)) {
            deny('activity_events')
          }
          const id = (s.activity.at(-1)?.id ?? 0) + 1
          s.activity.push({ ...activityRowFor(e, houseId, at), id })
        }
      },
    },
  }
}

// ---- data rules (keep in sync with the migrations' CHECKs and unique indexes) -------------------

/** poll_options: a 1–80 character label, unique in its poll (any case). */
const checkOption = (existing: readonly PollOption[], o: PollOption): void => {
  const label = o.label.trim()
  if (!label || label.length > 80) throw new ConstraintViolation('poll_options: label')
  if (o.note && o.note.length > 280) throw new ConstraintViolation('poll_options: note')
  if (existing.some((x) => x.label.trim().toLowerCase() === label.toLowerCase()))
    throw new ConstraintViolation('poll_options: duplicate label')
}

const refuse = (rule: string): never => {
  throw new ConstraintViolation(`items: ${rule}`)
}

const checkItem = (s: MemoryState, item: Item): void => {
  const i = item as Item & {
    repeatDays?: unknown
    lastDone?: unknown
    contactId?: unknown
    done?: unknown
  }
  if (!i.title.trim() || i.title.trim().length > 120) refuse('title')
  if (i.category !== 'chore' && (i.repeatDays != null || i.lastDone)) refuse('chore-only fields')
  if (
    i.category === 'chore' &&
    i.repeatDays != null &&
    !(Number.isInteger(i.repeatDays) && Number(i.repeatDays) >= 1 && Number(i.repeatDays) <= 365)
  )
    refuse('repeat days are 1 to 365')
  if (i.category !== 'task' && i.contactId) refuse('task-only contact')
  if (i.category === 'chore' && i.done) refuse('chores are never done')
  if (i.run && (i.done || i.archivedAt)) refuse('done or archived items are not on a run')
  if (i.run) {
    const r = s.runs.get(i.run.id)
    if (r?.houseId !== i.houseId || r.kind !== i.run.kind) refuse('run: no such run in this house')
  }
  if (i.run && i.run.kind !== 'batch' && i.category !== 'task')
    refuse('requests and visits hold tasks only')
  if (i.category === 'need' && !i.done && !i.archivedAt) {
    const clash = [...s.items.values()].some(
      (o) =>
        o.id !== i.id &&
        o.houseId === i.houseId &&
        o.category === 'need' &&
        !o.done &&
        !o.archivedAt &&
        sameNeed(o.title, i.title),
    )
    if (clash) refuse('an open need with this title already exists')
  }
}

// ---- the unit of work ---------------------------------------------------------------

export class MemoryUnitOfWork implements UnitOfWork {
  state: MemoryState = emptyState()
  private queue: Promise<unknown> = Promise.resolve()

  private listeners = new Set<(rows: readonly StoredActivityRow[]) => void>()

  run<T>(actor: Actor, fn: (repos: Repos) => Promise<T>): Promise<T> {
    // One transaction at a time, like serializable isolation.
    const next = this.queue.then(async () => {
      const working = structuredClone(this.state)
      const result = await fn(reposFor(working, actor))
      if (!isFailedResult(result)) {
        const added = working.activity.slice(this.state.activity.length)
        this.state = working
        if (added.length) this.listeners.forEach((l) => l(added))
      }
      return result
    })
    this.queue = next.catch(() => undefined)
    return next
  }

  /** Activity rows as each transaction commits (what the memory ChangeFeed listens to). */
  onCommit(listener: (rows: readonly StoredActivityRow[]) => void): () => void {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  /** Auth users live outside the app tables (Supabase Auth owns them in production). */
  addUser(id: UserId, email: string): void {
    this.state.users.set(id, { email })
  }
}
