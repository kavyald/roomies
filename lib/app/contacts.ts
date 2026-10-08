import { actorUser, type HouseActor } from '../domain/actor'
import {
  createContact,
  editContact,
  removeContact,
  type ContactPatch,
  type NewContact,
} from '../domain/contacts'
import type { Contact } from '../domain/house'
import type { ContactId } from '../domain/ids'
import { err, ok, type Result } from '../domain/result'
import type { AppDeps } from './ports'

export type CreateContactError = 'empty_name' | 'not_found'

export const makeCreateContact =
  ({ uow, clock, ids }: Pick<AppDeps, 'uow' | 'clock' | 'ids'>) =>
  (actor: HouseActor, input: NewContact): Promise<Result<Contact, CreateContactError>> =>
    uow.run(actor, async (repos) => {
      const house = await repos.houses.get(actor.houseId)
      if (!house) return err('not_found')

      const r = createContact(input, house.id, actorUser(actor), ids.newId(), ids.newId())
      if (!r.ok) return r

      await repos.contacts.save(r.value.contact)
      await repos.events.record(house.id, r.value.events, clock.now())
      return ok(r.value.contact)
    })

export const makeEditContact =
  ({ uow, clock, ids }: Pick<AppDeps, 'uow' | 'clock' | 'ids'>) =>
  (
    actor: HouseActor,
    input: { id: ContactId; patch: ContactPatch },
  ): Promise<Result<Contact, 'not_found' | 'empty_name' | 'no_change'>> =>
    uow.run(actor, async (repos) => {
      const c = await repos.contacts.get(input.id)
      if (!c || c.houseId !== actor.houseId || c.archivedAt) return err('not_found')
      const r = editContact(c, input.patch, actorUser(actor), ids.newId())
      if (!r.ok) return r
      await repos.contacts.save(r.value.contact)
      await repos.events.record(c.houseId, r.value.events, clock.now())
      return ok(r.value.contact)
    })

export const makeRemoveContact =
  ({ uow, clock, ids }: Pick<AppDeps, 'uow' | 'clock' | 'ids'>) =>
  (actor: HouseActor, id: ContactId): Promise<Result<Contact, 'not_found' | 'already_removed'>> =>
    uow.run(actor, async (repos) => {
      const c = await repos.contacts.get(id)
      if (!c || c.houseId !== actor.houseId) return err('not_found')
      const now = clock.now()
      const r = removeContact(c, actorUser(actor), now, ids.newId())
      if (!r.ok) return r
      await repos.contacts.save(r.value.contact)
      await repos.events.record(c.houseId, r.value.events, now)
      return ok(r.value.contact)
    })
