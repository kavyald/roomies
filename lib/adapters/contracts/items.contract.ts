// The items repository contract: round trips for each category, and the category rules held by
// the storage itself (the DB's CHECKs and unique index; the memory adapter's mirror of them).

import { beforeAll, describe, expect, it } from 'vitest'
import { AccessDenied, ConstraintViolation } from '../../app/ports'
import type { Chore, Item, Need, Task } from '../../domain/items'
import { instant, type LocalDate, type LocalTime } from '../../domain/time'
import { asMember, seedHouse, system, type UnitOfWorkHarness } from './unit-of-work.contract'

const T = instant(Date.UTC(2026, 8, 29, 16, 0))

export const itemsContract = (name: string, makeHarness: () => Promise<UnitOfWorkHarness>) =>
  describe(`Items contract: ${name}`, () => {
    let h: UnitOfWorkHarness
    beforeAll(async () => {
      h = await makeHarness()
    })

    const setup = async () => {
      const seeded = await seedHouse(h)
      const need = (title: string, o: Partial<Need> = {}): Need => ({
        id: h.ids.newId(),
        houseId: seeded.house.id,
        category: 'need',
        title,
        priority: 'normal',
        createdBy: seeded.member,
        createdAt: T,
        ...o,
      })
      const put = (item: Item) =>
        h.uow.run(asMember(seeded.house.id, seeded.member), (r) => r.items.save(item))
      const get = (id: Item['id']) => h.uow.run(system(seeded.house.id), (r) => r.items.get(id))
      return { ...seeded, need, put, get }
    }

    it('round-trips each category, with dates in the house time zone', async () => {
      const { house, member, admin, need, put, get } = await setup()
      const tomatoes = need('Tomatoes', {
        note: 'the vine ones',
        when: { date: '2026-11-01' as LocalDate }, // the fall-back day in New York
        priority: 'high',
      })
      const trash: Chore = {
        id: h.ids.newId(),
        houseId: house.id,
        category: 'chore',
        title: 'Trash',
        priority: 'normal',
        repeatDays: 7,
        lastDone: { at: T, by: admin },
        assignee: admin,
        createdBy: member,
        createdAt: T,
      }
      const latch: Task = {
        id: h.ids.newId(),
        houseId: house.id,
        category: 'task',
        title: 'Fix the window latch',
        priority: 'normal',
        when: { date: '2026-03-08' as LocalDate, time: '09:30' as LocalTime }, // spring-forward day
        done: { at: T, by: member },
        createdBy: member,
        createdAt: T,
      }
      for (const i of [tomatoes, trash, latch]) await put(i)
      expect(await get(tomatoes.id)).toEqual(tomatoes)
      expect(await get(trash.id)).toEqual(trash)
      expect(await get(latch.id)).toEqual(latch)
      const { lastDone: _lastDone, ...neverDone } = trash
      const asNeeded: Chore = {
        ...neverDone,
        id: h.ids.newId(),
        title: 'Descale kettle',
        repeatDays: null,
      }
      await put(asNeeded)
      expect(await get(asNeeded.id)).toEqual(asNeeded)

      const all = await h.uow.run(system(house.id), (r) => r.items.listByHouse(house.id))
      expect(all.map((i) => i.title).sort()).toEqual([
        'Descale kettle',
        'Fix the window latch',
        'Tomatoes',
        'Trash',
      ])
    })

    it("an open need can't repeat (any case), but a done or archived one doesn't count", async () => {
      const { house, member, need, put } = await setup()
      await put(need('Paper towels'))
      await put(need('Oat milk', { done: { at: T, by: member } }))
      await put(need('oat milk')) // the done one doesn't block
      await expect(put(need('  paper TOWELS '))).rejects.toBeInstanceOf(ConstraintViolation)
      await put(need('Milk', { archivedAt: T }))
      await put(need('Milk')) // the archived one doesn't block
      const open = await h.uow.run(system(house.id), (r) => r.items.openNeeds(house.id))
      expect(open.map((n) => n.title).sort()).toEqual(['Milk', 'Paper towels', 'oat milk'])
    })

    it("a chore can't be done, and only tasks have a contact", async () => {
      const { house, member, need, put } = await setup()
      const chore = {
        id: h.ids.newId(),
        houseId: house.id,
        category: 'chore',
        title: 'Vacuum',
        priority: 'normal',
        repeatDays: null,
        done: { at: T, by: member },
        createdBy: member,
        createdAt: T,
      } as unknown as Item
      await expect(put(chore)).rejects.toBeInstanceOf(ConstraintViolation)
      const contactId = h.ids.newId<'contact'>()
      await h.uow.run(system(house.id), (r) =>
        r.contacts.save({ id: contactId as never, houseId: house.id, name: 'Super' }),
      )
      await expect(put({ ...need('Bulbs'), contactId } as unknown as Item)).rejects.toBeInstanceOf(
        ConstraintViolation,
      )
      await expect(
        put({ ...need('Soap'), repeatDays: 7 } as unknown as Item),
      ).rejects.toBeInstanceOf(ConstraintViolation)
    })

    it("members read and write their house's items only, in their own name", async () => {
      const mine = await setup()
      const theirs = await setup()
      const secret = theirs.need('Surprise party supplies')
      await theirs.put(secret)
      const me = asMember(mine.house.id, mine.member)
      expect(await h.uow.run(me, (r) => r.items.get(secret.id))).toBeUndefined()
      expect(await h.uow.run(me, (r) => r.items.listByHouse(theirs.house.id))).toEqual([])
      await expect(
        h.uow.run(me, (r) => r.items.save({ ...theirs.need('Nope'), createdBy: mine.member })),
      ).rejects.toBeInstanceOf(AccessDenied)
      await expect(
        h.uow.run(me, (r) => r.items.save(mine.need('Forged', { createdBy: mine.admin }))),
      ).rejects.toBeInstanceOf(AccessDenied)
    })
  })
