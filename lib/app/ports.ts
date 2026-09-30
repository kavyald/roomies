// Ports: the interfaces use cases depend on (ARCHITECTURE §4.1). Adapters implement them;
// lib/compose.ts wires the concrete ones. Repos grow as each feature adds its tables.

import type { Actor } from '../domain/actor'
import type { DomainEvent, EventKind, StoredActivityRow } from '../domain/events'
import type { Contact, House, Invite, Member, Profile, Room } from '../domain/house'
import type {
  ContactId,
  HouseId,
  Id,
  InviteId,
  ItemId,
  PollId,
  RoomId,
  RunId,
  UserId,
} from '../domain/ids'
import type { Cost } from '../domain/costs'
import type { NotificationCategory, OutboxMessage } from '../domain/notifications'
import type { PendingMessage, PushOutcome, PushSubscription } from '../domain/push'
import type { Poll, PollOption, Vote } from '../domain/polls'
import type { Feeling } from '../domain/feelings'
import type { Item, Need } from '../domain/items'
import type { Result } from '../domain/result'
import type { Run } from '../domain/runs'
import type { Instant } from '../domain/time'

// ---- infrastructure ----------------------------------------------------------

export interface Clock {
  now(): Instant
}

export interface IdGenerator {
  newId<K extends string>(): Id<K>
}

/** Invite tokens: random secrets that are stored only as hashes. */
export interface Tokens {
  /** A new unguessable token (128 bits, URL-safe). */
  newToken(): string
  hash(token: string): string
}

/**
 * Counts attempts per key (e.g. "invite:start:<ip>") in fixed windows. Counts are kept even when
 * the attempt fails, so it runs outside the use case's transaction.
 */
export interface RateLimiter {
  /** Records one attempt; true while the key is within `limit` attempts per window. */
  hit(key: string, rule: { limit: number; windowMs: number }, now: Instant): Promise<boolean>
}

/** What use cases need from configuration. Secrets for adapters stay in the composition root. */
export type Config = {
  readonly setupToken: string
}

// ---- write side: repositories inside one transaction ----------------------------

export interface HouseRepo {
  get(id: HouseId): Promise<House | undefined>
  /** Whether this actor can see any house. */
  any(): Promise<boolean>
  /** Whether no house exists at all, so /setup still works. Answered outside RLS. */
  setupAvailable(): Promise<boolean>
  /** Every house this actor can see (the jobs walk them all as the system). */
  listAll(): Promise<House[]>
  save(house: House): Promise<void>
}

export interface ProfileRepo {
  get(id: UserId): Promise<Profile | undefined>
  save(profile: Profile): Promise<void>
}

export interface MemberRepo {
  get(houseId: HouseId, userId: UserId): Promise<Member | undefined>
  listByHouse(houseId: HouseId): Promise<Member[]>
  /** Every house this user belongs or belonged to. */
  listForUser(userId: UserId): Promise<Member[]>
  save(member: Member): Promise<void>
}

export interface RoomRepo {
  get(id: RoomId): Promise<Room | undefined>
  listByHouse(houseId: HouseId): Promise<Room[]>
  save(room: Room): Promise<void>
}

export interface ContactRepo {
  get(id: ContactId): Promise<Contact | undefined>
  listByHouse(houseId: HouseId): Promise<Contact[]>
  save(contact: Contact): Promise<void>
}

export interface InviteRepo {
  get(id: InviteId): Promise<Invite | undefined>
  findByTokenHash(tokenHash: string): Promise<Invite | undefined>
  listByHouse(houseId: HouseId): Promise<Invite[]>
  save(invite: Invite): Promise<void>
}

export interface ItemRepo {
  get(id: ItemId): Promise<Item | undefined>
  /** Every item in the house, archived ones included. */
  listByHouse(houseId: HouseId): Promise<Item[]>
  /** Needs that are open (not done, not archived): what "already on the list" is checked against. */
  openNeeds(houseId: HouseId): Promise<Need[]>
  /** The items on a run right now. */
  onRun(runId: RunId): Promise<Item[]>
  save(item: Item): Promise<void>
}

/**
 * Polls are saved piece by piece, because each piece has its own rule: anyone adds an option or
 * casts their own vote while it's open; opening and closing is the poll row.
 */
export interface PollRepo {
  get(id: PollId): Promise<Poll | undefined>
  listByHouse(houseId: HouseId): Promise<Poll[]>
  /** A new poll with its first options. */
  create(poll: Poll): Promise<void>
  addOption(poll: Poll, option: PollOption): Promise<void>
  /** Casts or changes this member's vote. */
  setVote(poll: Poll, vote: Vote): Promise<void>
  /** Its deadline and whether it's closed. */
  saveState(poll: Poll): Promise<void>
}

/** Notification settings and the outbox (the push sender drains it, T34). */
export interface NotificationRepo {
  /** The categories each of these people turned off (everyone else: all on). */
  offFor(userIds: readonly UserId[]): Promise<Map<UserId, Set<NotificationCategory>>>
  setEnabled(userId: UserId, category: NotificationCategory, enabled: boolean): Promise<void>
  /**
   * Written in the same transaction as the events that caused them. A message whose dedupe key
   * is already in the outbox is skipped; returns how many were written.
   */
  enqueue(messages: readonly OutboxMessage[]): Promise<number>
  /** Messages due by `now` and not sent yet, oldest first (the sender runs as the system). */
  pending(now: Instant, limit: number): Promise<PendingMessage[]>
  /** Done with a message: delivered (error null) or given up on, with why. */
  markSent(id: number, at: Instant, error: string | null): Promise<void>
}

/** Browsers that turned notifications on. */
export interface PushSubscriptionRepo {
  /** Adds this browser, or refreshes it (same endpoint) for the same person. */
  save(sub: PushSubscription): Promise<void>
  /** Their browsers that still work. */
  forUsers(userIds: readonly UserId[]): Promise<PushSubscription[]>
  markOk(id: string, at: Instant): Promise<void>
  /** The push service said it's gone (404/410): stop sending to it. */
  markGone(id: string, at: Instant): Promise<void>
}

/** Delivers one push (web-push in production, a fake in tests). */
export interface PushSender {
  send(sub: PushSubscription, payload: string): Promise<PushOutcome>
}

/** Costs are recorded, never edited or deleted in v1. */
export interface CostRepo {
  listByHouse(houseId: HouseId): Promise<Cost[]>
  add(cost: Cost): Promise<void>
}

export interface RunRepo {
  get(id: RunId): Promise<Run | undefined>
  listByHouse(houseId: HouseId): Promise<Run[]>
  save(run: Run): Promise<void>
}

export interface FeelingRepo {
  get(itemId: ItemId, userId: UserId): Promise<Feeling | undefined>
  save(houseId: HouseId, feeling: Feeling): Promise<void>
  /** Removes my current feeling; its history stays in the activity log. */
  remove(itemId: ItemId, userId: UserId): Promise<void>
}

/** Writes activity (and, from T33, outbox) rows in the same transaction as the change. */
export interface EventSink {
  record(houseId: HouseId, events: readonly DomainEvent[], at: Instant): Promise<void>
  /** A run's story so far (rows on it or moved into it), oldest first. */
  forRun(houseId: HouseId, runId: RunId): Promise<StoredActivityRow[]>
}

export interface Repos {
  readonly houses: HouseRepo
  readonly profiles: ProfileRepo
  readonly members: MemberRepo
  readonly rooms: RoomRepo
  readonly contacts: ContactRepo
  readonly invites: InviteRepo
  readonly items: ItemRepo
  readonly feelings: FeelingRepo
  readonly runs: RunRepo
  readonly polls: PollRepo
  readonly costs: CostRepo
  readonly notifications: NotificationRepo
  readonly pushSubscriptions: PushSubscriptionRepo
  readonly events: EventSink
}

/**
 * One transaction per call, acting as `actor` (RLS applies to members).
 * It commits when `fn` resolves, and rolls back when `fn` throws or resolves to a failed
 * Result (`{ ok: false }`), so a use case that bails out halfway never leaves partial writes.
 */
export interface UnitOfWork {
  run<T>(actor: Actor, fn: (repos: Repos) => Promise<T>): Promise<T>
}

/** Thrown when a write breaks a data rule (a CHECK or unique constraint in Postgres). */
export class ConstraintViolation extends Error {
  override name = 'ConstraintViolation'
}

/** Thrown by a UnitOfWork when a write breaks an access rule (RLS in Postgres). */
export class AccessDenied extends Error {
  override name = 'AccessDenied'
}

// ---- auth ----------------------------------------------------------------------

export interface AuthGateway {
  /** Creates the account for an email (invites only; public sign-up is off). */
  createUser(email: string): Promise<Result<UserId, 'already_exists'>>
  /** Sends a 6-digit code, but only to an existing account. Says nothing either way. */
  sendCode(email: string): Promise<void>
  deleteUser(id: UserId): Promise<void>
}

// ---- read side -------------------------------------------------------------------

/** Reads for screens. The browser adapter goes through RLS with the user's session. */
export interface HouseQueries {
  house(houseId: HouseId): Promise<House | undefined>
  members(houseId: HouseId): Promise<Member[]>
  profiles(houseId: HouseId): Promise<Profile[]>
  rooms(houseId: HouseId): Promise<Room[]>
  contacts(houseId: HouseId): Promise<Contact[]>
  /** Everyone's current feelings on the house's items. */
  feelings(houseId: HouseId): Promise<Feeling[]>
  /** An item's activity, newest first (its path, Earlier feelings). */
  itemActivity(houseId: HouseId, itemId: ItemId): Promise<StoredActivityRow[]>
  /** The house's items (needs, chores, tasks), archived ones included. */
  items(houseId: HouseId): Promise<Item[]>
  /** The house's invites; admins only (others get none). */
  invites(houseId: HouseId): Promise<Invite[]>
  /** The house's most recent activity row of one kind (the Home card for a weights change). */
  latestActivity(houseId: HouseId, kind: EventKind): Promise<StoredActivityRow | undefined>
  /** The house's polls, open and closed, with their options and votes. */
  polls(houseId: HouseId): Promise<Poll[]>
  /** The house's costs, oldest first. */
  costs(houseId: HouseId): Promise<Cost[]>
  /** The house's runs, open ones and finished ones. */
  runs(houseId: HouseId): Promise<Run[]>
  /** A run's story (rows on it or moved into it), oldest first. */
  runActivity(houseId: HouseId, runId: RunId): Promise<StoredActivityRow[]>
  /** Newest first, `limit` rows or a little more: an action is never split across pages. */
  activity(houseId: HouseId, page: { before?: number; limit: number }): Promise<ActivityPage>
}

/** `before` is the cursor for the next (older) page, or null at the start of history. */
export type ActivityPage = { readonly rows: StoredActivityRow[]; readonly before: number | null }

export type Change = { readonly table: string }
export type Unsubscribe = () => void

export interface ChangeFeed {
  subscribe(houseId: HouseId, onChange: (change: Change) => void): Unsubscribe
}

// ---- everything a use case can ask for -----------------------------------------------

export type AppDeps = {
  readonly uow: UnitOfWork
  readonly clock: Clock
  readonly ids: IdGenerator
  readonly auth: AuthGateway
  readonly tokens: Tokens
  readonly limiter: RateLimiter
  readonly push: PushSender
  readonly config: Config
}
