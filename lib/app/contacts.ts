import { actorUser, type Actor } from '../domain/actor'
import { createContact, type NewContact } from '../domain/contacts'
import type { Contact } from '../domain/house'
import { err, ok, type Result } from '../domain/result'
import type { AppDeps } from './ports'

export type CreateContactError = 'empty_name' | 'not_found'

export const makeCreateContact =
  ({ uow, clock, ids }: Pick<AppDeps, 'uow' | 'clock' | 'ids'>) =>
  (actor: Actor, input: NewContact): Promise<Result<Contact, CreateContactError>> =>
    uow.run(actor, async (repos) => {
      const house = await repos.houses.get(actor.houseId)
      if (!house) return err('not_found')

      const r = createContact(input, house.id, actorUser(actor), ids.newId(), ids.newId())
      if (!r.ok) return r

      await repos.contacts.save(r.value.contact)
      await repos.events.record(house.id, r.value.events, clock.now())
      return ok(r.value.contact)
    })
