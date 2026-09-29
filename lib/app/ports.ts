// Ports: the interfaces use cases depend on (ARCHITECTURE §4.1). Adapters implement them;
// lib/compose.ts wires the concrete ones. Repos grow as each feature adds its tables.

import type { Actor } from '../domain/actor'
import type { DomainEvent } from '../domain/events'
import type { Contact, House, Invite, Member, Profile, Room } from '../domain/house'
import type { ContactId, HouseId, Id, InviteId, RoomId, UserId } from '../domain/ids'
import type { Result } from '../domain/result'
import type { Instant } from '../domain/time'

// ---- infrastructure ----------------------------------------------------------

export interface Clock {
  now(): Instant
}

export interface IdGenerator {
  newId<K extends string>(): Id<K>
}

/** What use cases need from configuration. Secrets for adapters stay in the composition root. */
export type Config = {
  readonly setupToken: string
}

// ---- write side: repositories inside one transaction ----------------------------

export interface HouseRepo {
  get(id: HouseId): Promise<House | undefined>
  /** Whether any house exists (the setup route works only once). */
  any(): Promise<boolean>
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
  save(invite: Invite): Promise<void>
}

/** Writes activity (and, from T33, outbox) rows in the same transaction as the change. */
export interface EventSink {
  record(houseId: HouseId, events: readonly DomainEvent[], at: Instant): Promise<void>
}

export interface Repos {
  readonly houses: HouseRepo
  readonly profiles: ProfileRepo
  readonly members: MemberRepo
  readonly rooms: RoomRepo
  readonly contacts: ContactRepo
  readonly invites: InviteRepo
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
}

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
  readonly config: Config
}
