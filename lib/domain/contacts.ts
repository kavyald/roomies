import type { DomainEvent } from './events'
import type { Contact, House } from './house'
import type { ActionId, ContactId, UserId } from './ids'
import { err, ok, type Result } from './result'

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
