// The UI's single dependency (ARCHITECTURE §4.1 "In the UI"): reads through HouseQueries,
// live updates through ChangeFeed, and writes through commands that call server actions.
// Screens and hooks depend on this interface; tests and /dev pages inject a fake.

import type { ChangeFeed, HouseQueries } from '../app/ports'
import type { NewContact } from '../domain/contacts'
import type { Contact, Invite } from '../domain/house'
import type { InviteId, UserId } from '../domain/ids'
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
}

export type AppClient = {
  /** Who is using the app. */
  readonly me: UserId
  readonly queries: HouseQueries
  readonly changes: ChangeFeed
  readonly commands: AppCommands
}
