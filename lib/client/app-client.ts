// The UI's single dependency (ARCHITECTURE §4.1 "In the UI"): reads through HouseQueries,
// live updates through ChangeFeed, and writes through commands that call server actions.
// Screens and hooks depend on this interface; tests and /dev pages inject a fake.

import type { ChangeFeed, HouseQueries } from '../app/ports'
import type { NewContact } from '../domain/contacts'
import type { ContactPatch } from '../domain/contacts'
import type { Contact, Invite, Member, Role, Room } from '../domain/house'
import type { ReferenceError } from '../app/items'
import type { ContactId, InviteId, ItemId, RoomId, UserId } from '../domain/ids'
import type { Item, ItemError, ItemPatch, NewItem } from '../domain/items'
import type { NewInvite } from '../domain/invites'
import type { Result } from '../domain/result'

/** What any command can fail with, besides its own business errors. */
export type CommandFailure = 'invalid_input' | 'not_signed_in' | 'not_allowed' | 'unexpected'

export type CommandResult<T, E extends string = never> = Result<T, E | CommandFailure>

export type AppCommands = {
  createContact(input: NewContact): Promise<CommandResult<Contact, 'empty_name' | 'not_found'>>
  createInvite(
    input: NewInvite,
  ): Promise<
    CommandResult<{ invite: Invite; token: string }, 'not_admin' | 'bad_limits' | 'not_found'>
  >
  revokeInvite(id: InviteId): Promise<CommandResult<Invite, 'not_found' | 'already_revoked'>>
  editContact(input: {
    id: ContactId
    patch: ContactPatch
  }): Promise<CommandResult<Contact, 'not_found' | 'empty_name' | 'no_change'>>
  removeContact(id: ContactId): Promise<CommandResult<Contact, 'not_found' | 'already_removed'>>
  moveOut(input: {
    userId: UserId
    note?: string
  }): Promise<
    CommandResult<Member, 'not_found' | 'not_allowed' | 'already_moved_out' | 'last_admin'>
  >
  setRole(input: {
    userId: UserId
    role: Role
  }): Promise<
    CommandResult<Member, 'not_found' | 'not_allowed' | 'no_change' | 'last_admin' | 'not_active'>
  >
  renameRoom(input: {
    roomId: RoomId
    name: string
  }): Promise<CommandResult<Room, 'not_found' | 'empty_name' | 'no_change'>>
  moveRoom(input: {
    roomId: RoomId
    direction: 'up' | 'down'
  }): Promise<CommandResult<Room[], 'not_found' | 'at_edge'>>
  deleteAccount(): Promise<CommandResult<void, 'last_admin' | 'not_found'>>
  createItem(
    input: NewItem,
  ): Promise<CommandResult<Item, ItemError | ReferenceError | 'duplicate_need' | 'not_found'>>
  editItem(input: {
    id: ItemId
    patch: ItemPatch
  }): Promise<
    CommandResult<Item, ItemError | ReferenceError | 'duplicate_need' | 'no_change' | 'not_found'>
  >
  markDone(
    id: ItemId,
  ): Promise<CommandResult<Item, 'already_done' | 'archived' | 'not_for_chores' | 'not_found'>>
  reopenItem(
    id: ItemId,
  ): Promise<CommandResult<Item, 'not_done' | 'duplicate_need' | 'not_for_chores' | 'not_found'>>
  doChore(id: ItemId): Promise<CommandResult<Item, 'archived' | 'not_a_chore' | 'not_found'>>
  archiveItem(id: ItemId): Promise<CommandResult<Item, 'already_archived' | 'not_found'>>
  restoreItem(
    id: ItemId,
  ): Promise<CommandResult<Item, 'not_archived' | 'duplicate_need' | 'not_found'>>
}

export type AppClient = {
  /** Who is using the app. */
  readonly me: UserId
  readonly queries: HouseQueries
  readonly changes: ChangeFeed
  readonly commands: AppCommands
}
