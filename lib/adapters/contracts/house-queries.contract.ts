// The HouseQueries contract: the read side returns domain types, scoped by access rules.
// Run against memory (unit) and the Supabase browser adapter (db, through PostgREST + RLS).

import { beforeAll, describe, expect, it } from 'vitest'
import type { HouseQueries } from '../../app/ports'
import type { Contact, Room } from '../../domain/house'
import type { HouseId, UserId } from '../../domain/ids'
import { seedHouse, system, type UnitOfWorkHarness } from './unit-of-work.contract'

export type HouseQueriesHarness = UnitOfWorkHarness & {
  /** Reads as this user, the way the browser does. */
  queriesFor(userId: UserId, houseId: HouseId): HouseQueries
}

export const houseQueriesContract = (
  name: string,
  makeHarness: () => Promise<HouseQueriesHarness>,
) =>
  describe(`HouseQueries contract: ${name}`, () => {
    let h: HouseQueriesHarness
    beforeAll(async () => {
      h = await makeHarness()
    })

    const withPlaces = async () => {
      const seeded = await seedHouse(h)
      const { house } = seeded
      const rooms: Room[] = [
        {
          id: h.ids.newId(),
          houseId: house.id,
          name: 'Kitchen',
          floor: 'first',
          kind: 'common',
          sortOrder: 2,
        },
        {
          id: h.ids.newId(),
          houseId: house.id,
          name: 'Air',
          floor: 'first',
          kind: 'bedroom',
          element: 'air',
          sortOrder: 1,
        },
      ]
      const contacts: Contact[] = [
        { id: h.ids.newId(), houseId: house.id, name: 'super', phone: '555-0100' },
        { id: h.ids.newId(), houseId: house.id, name: 'Landlord' },
      ]
      await h.uow.run(system(house.id), async (r) => {
        for (const room of rooms) await r.rooms.save(room)
        for (const c of contacts) await r.contacts.save(c)
      })
      return { ...seeded, rooms, contacts }
    }

    it('a member reads their house, people, rooms, and contacts', async () => {
      const { house, admin, member, rooms, contacts } = await withPlaces()
      const q = h.queriesFor(member, house.id)
      expect(await q.house(house.id)).toEqual(house)
      expect((await q.members(house.id)).map((m) => m.userId).sort()).toEqual(
        [admin, member].sort(),
      )
      expect((await q.profiles(house.id)).map((p) => p.displayName).sort()).toEqual([
        'Kavya',
        'Wren',
      ])
      expect(await q.rooms(house.id)).toEqual([rooms[1], rooms[0]])
      expect(await q.contacts(house.id)).toEqual([contacts[1], contacts[0]])
    })

    it('a member of another house reads nothing of this one', async () => {
      const { house } = await withPlaces()
      const other = await seedHouse(h)
      const q = h.queriesFor(other.member, other.house.id)
      expect(await q.house(house.id)).toBeUndefined()
      expect(await q.members(house.id)).toEqual([])
      expect(await q.profiles(house.id)).toEqual([])
      expect(await q.rooms(house.id)).toEqual([])
      expect(await q.contacts(house.id)).toEqual([])
    })
  })
