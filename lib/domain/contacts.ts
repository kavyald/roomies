import type { DomainEvent } from './events'
import type { Contact, House } from './house'
import type { ActionId, ContactId, UserId } from './ids'
import { err, ok, type Result } from './result'
import type { Instant } from './time'

export type NewContact = { readonly name: string; readonly phone?: string; readonly note?: string }

const trimmed = (s: string | undefined): string | undefined => {
  const t = s?.trim()
  return t ? t : undefined
}

export const createContact = (
  input: NewContact,
  houseId: House['id'],
  by: UserId | null,
  id: ContactId,
  actionId: ActionId,
): Result<{ contact: Contact; events: DomainEvent[] }, 'empty_name'> => {
  const name = trimmed(input.name)
  if (!name) return err('empty_name')
  const phone = trimmed(input.phone)
  const note = trimmed(input.note)
  const contact: Contact = {
    id,
    houseId,
    name,
    ...(phone && { phone }),
    ...(note && { note }),
  }
  return ok({ contact, events: [{ kind: 'contact.created', contactId: id, actionId, by }] })
}

export type ContactPatch = {
  readonly name?: string
  readonly phone?: string
  readonly note?: string
}

/** Edits a contact; an empty phone or note clears it. */
export const editContact = (
  c: Contact,
  patch: ContactPatch,
  by: UserId | null,
  actionId: ActionId,
): Result<{ contact: Contact; events: DomainEvent[] }, 'empty_name' | 'no_change'> => {
  const name = patch.name === undefined ? c.name : trimmed(patch.name)
  if (!name) return err('empty_name')
  const phone = patch.phone === undefined ? c.phone : trimmed(patch.phone)
  const note = patch.note === undefined ? c.note : trimmed(patch.note)
  const changes: Record<string, [unknown, unknown]> = {}
  if (name !== c.name) changes.name = [c.name, name]
  if (phone !== c.phone) changes.phone = [c.phone ?? null, phone ?? null]
  if (note !== c.note) changes.note = [c.note ?? null, note ?? null]
  if (Object.keys(changes).length === 0) return err('no_change')
  const { phone: _p, note: _n, ...rest } = c
  const contact: Contact = { ...rest, name, ...(phone && { phone }), ...(note && { note }) }
  return ok({
    contact,
    events: [{ kind: 'contact.edited', contactId: c.id, changes, actionId, by }],
  })
}

/** Removing a contact archives it: activity and tasks still point at it. */
export const removeContact = (
  c: Contact,
  by: UserId | null,
  now: Instant,
  actionId: ActionId,
): Result<{ contact: Contact; events: DomainEvent[] }, 'already_removed'> =>
  c.archivedAt
    ? err('already_removed')
    : ok({
        contact: { ...c, archivedAt: now },
        events: [{ kind: 'contact.removed', contactId: c.id, actionId, by }],
      })
