// The UI's single dependency (ARCHITECTURE §4.1 "In the UI"): reads through HouseQueries,
// live updates through ChangeFeed, and writes through commands that call server actions.
// Screens and hooks depend on this interface; tests and /dev pages inject a fake.

import type { ChangeFeed, HouseQueries } from '../app/ports'
import type { NewContact } from '../domain/contacts'
import type { ContactPatch } from '../domain/contacts'
import type { Feeling, FeelingKind, FeelingWeights } from '../domain/feelings'
import type { Contact, House, Invite, Member, Role, Room } from '../domain/house'
import type { ReferenceError } from '../app/items'
import type { ContactId, InviteId, ItemId, RoomId, RunId, UserId } from '../domain/ids'
import type { NewRun, Run, SentVia } from '../domain/runs'
import type { When } from '../domain/time'

type RunStartError =
  'already_on_a_run' | 'done_item' | 'tasks_only' | 'title_too_long' | 'not_found'
type RunMoveError =
  'nothing_selected' | 'not_on_run' | 'same_run' | 'target_closed' | 'tasks_only' | 'not_found'
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
  startRun(
    input: NewRun & { itemIds: ItemId[] },
  ): Promise<
    CommandResult<
      Run,
      | 'nothing_selected'
      | 'already_on_a_run'
      | 'done_item'
      | 'title_too_long'
      | 'unknown_member'
      | 'not_found'
    >
  >
  addToRun(input: {
    runId: RunId
    itemIds: ItemId[]
  }): Promise<
    CommandResult<
      Run,
      | 'nothing_selected'
      | 'finished'
      | 'request_sent'
      | 'already_on_a_run'
      | 'done_item'
      | 'tasks_only'
      | 'not_found'
    >
  >
  markRunItemsDone(input: {
    runId: RunId
    itemIds: ItemId[]
  }): Promise<CommandResult<Run, 'nothing_selected' | 'not_on_run' | 'not_found'>>
  moveRunItems(input: {
    fromRunId: RunId
    toRunId: RunId
    itemIds: ItemId[]
    note?: string
  }): Promise<
    CommandResult<
      Run[],
      'nothing_selected' | 'not_on_run' | 'same_run' | 'target_closed' | 'tasks_only' | 'not_found'
    >
  >
  returnToPool(input: {
    runId: RunId
    itemIds: ItemId[]
    note?: string
    clearContact: boolean
  }): Promise<CommandResult<Run, 'nothing_selected' | 'not_on_run' | 'not_found'>>
  finishRun(input: {
    runId: RunId
  }): Promise<CommandResult<Run, 'finished' | 'not_finishable' | 'not_found'>>
  startRequest(input: {
    contactId: ContactId
    itemIds: ItemId[]
  }): Promise<CommandResult<Run, RunStartError>>
  planVisit(input: {
    contactId: ContactId
    itemIds: ItemId[]
    when?: When
  }): Promise<CommandResult<Run, RunStartError>>
  addToRequest(input: { taskId: ItemId }): Promise<CommandResult<Run, RunStartError | 'no_contact'>>
  sendRequest(input: {
    runId: RunId
    via: SentVia
  }): Promise<
    CommandResult<
      { run: Run; message: string },
      'not_a_request' | 'not_gathering' | 'empty' | 'not_found'
    >
  >
  handToContact(input: {
    runId: RunId
    itemIds: ItemId[]
    contactId: ContactId
    note?: string
  }): Promise<CommandResult<Run[], RunMoveError>>
  moveToNewVisit(input: {
    fromRunId: RunId
    itemIds: ItemId[]
    when?: When
    contactId?: ContactId
    note?: string
  }): Promise<
    CommandResult<
      Run[],
      RunMoveError | 'no_contact' | 'title_too_long' | 'already_on_a_run' | 'done_item'
    >
  >
  setVisitDate(input: {
    runId: RunId
    when: When | null
  }): Promise<CommandResult<Run, 'not_a_visit' | 'no_change' | 'not_found'>>
  setFeelingWeights(
    weights: FeelingWeights,
  ): Promise<CommandResult<House, 'not_found' | 'out_of_range' | 'no_change'>>
  setFeeling(input: {
    itemId: ItemId
    kind: FeelingKind | null
    note?: string
  }): Promise<CommandResult<Feeling | null, 'not_found' | 'no_change' | 'note_too_long'>>
}

export type AppClient = {
  /** Who is using the app. */
  readonly me: UserId
  readonly queries: HouseQueries
  readonly changes: ChangeFeed
  readonly commands: AppCommands
}
