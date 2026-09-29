// The mockup's house (TESTING.md §4): Kavya (Air, admin), Sam (Fire), Wren (Water), Jo (Earth),
// the apartment's rooms, and the super and landlord. Written through any UnitOfWork as the system
// actor, so it works on memory and Postgres alike. One house per call; tests never share rows.

import type { IdGenerator, UnitOfWork } from '../app/ports'
import type { Contact, Element, House, Room } from '../domain/house'
import type { UserId } from '../domain/ids'
import { APARTMENT_ROOMS } from '../domain/rooms'
import { aContact, aHouse, aMember, aProfile, aRoom } from './builders'

const PEOPLE = [
  { name: 'Kavya', element: 'air', role: 'admin' },
  { name: 'Sam', element: 'fire', role: 'member' },
  { name: 'Wren', element: 'water', role: 'member' },
  { name: 'Jo', element: 'earth', role: 'member' },
] as const

export type SampleHouse = {
  house: House
  people: Record<(typeof PEOPLE)[number]['name'], UserId>
  rooms: Record<string, Room>
  contacts: { super: Contact; landlord: Contact }
}

export const sampleHouse = async (
  uow: UnitOfWork,
  ids: IdGenerator,
  createUser: () => Promise<UserId>,
): Promise<SampleHouse> => {
  const userIds = await Promise.all(PEOPLE.map(() => createUser()))
  const house = aHouse(ids, userIds[0]!)
  const rooms = APARTMENT_ROOMS.map((r, i) => aRoom(ids, house.id, { ...r, sortOrder: i }))
  const bedroom = (el: Element) => rooms.find((r) => r.element === el)!
  const contacts = {
    super: aContact(ids, house.id, { name: 'Super', phone: '(555) 010-2231' }),
    landlord: aContact(ids, house.id, { name: 'Landlord', phone: '(555) 010-4478' }),
  }

  await uow.run({ kind: 'system', houseId: house.id }, async (r) => {
    for (const [i, p] of PEOPLE.entries())
      await r.profiles.save(aProfile(userIds[i]!, { displayName: p.name }))
    await r.houses.save(house)
    for (const room of rooms) await r.rooms.save(room)
    for (const [i, p] of PEOPLE.entries()) {
      await r.members.save(
        aMember(house.id, userIds[i]!, { role: p.role, roomId: bedroom(p.element).id }),
      )
    }
    await r.contacts.save(contacts.super)
    await r.contacts.save(contacts.landlord)
  })

  return {
    house,
    people: Object.fromEntries(
      PEOPLE.map((p, i) => [p.name, userIds[i]!]),
    ) as SampleHouse['people'],
    rooms: Object.fromEntries(rooms.map((r) => [r.name, r])),
    contacts,
  }
}
