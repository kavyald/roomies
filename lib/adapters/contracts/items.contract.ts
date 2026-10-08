// The items repository contract: round trips for each category, and the category rules held by
// the storage itself (the DB's CHECKs and unique index; the memory adapter's mirror of them).

import { beforeAll, describe, expect, it } from 'vitest'
import { AccessDenied, Conflict, ConstraintViolation } from '../../app/ports'
import type { Chore, Item, Need, Task } from '../../domain/items'
import { instant, type LocalDate, type LocalTime } from '../../domain/time'
import {
  asMember,
  seedHouse,
  system,
  unversioned,
  type UnitOfWorkHarness,
} from './unit-of-work.contract'

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
      const get = async (id: Item['id']) =>
        unversioned(await h.uow.run(system(seeded.house.id), (r) => r.items.get(id)))
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

    it("T45: a need is the house's or one person's; only needs are someone's", async () => {
      const { house, member, admin, need, put, get } = await setup()
      const mine = need('Milk', { forMember: member })
      await put(mine)
      expect(await get(mine.id)).toEqual(mine)
      // The house's Milk and Wren's are separate needs; a second of mine is a repeat.
      await put(need('milk'))
      await put(need('MILK', { forMember: admin }))
      await expect(put(need(' milk ', { forMember: member }))).rejects.toBeInstanceOf(
        ConstraintViolation,
      )
      await expect(put(need('Milk'))).rejects.toBeInstanceOf(ConstraintViolation)
      // Giving it back to the house, while the house has one open, is a repeat too.
      await expect(
        put({ ...(await get(mine.id))!, forMember: undefined } as Item),
      ).rejects.toBeInstanceOf(ConstraintViolation)
      await expect(
        put({
          ...need('Trash'),
          category: 'chore',
          repeatDays: 7,
          forMember: member,
        } as unknown as Item),
      ).rejects.toBeInstanceOf(ConstraintViolation)
      const open = await h.uow.run(system(house.id), (r) => r.items.openNeeds(house.id))
      expect(open.map((n) => n.forMember ?? 'house').sort()).toEqual(
        [admin, member, 'house'].sort(),
      )
    })

    it("Q6: one person's need is still the house's to see and get, and no one else's", async () => {
      const mine = await setup()
      const theirs = await setup()
      const oatMilk = mine.need('Oat milk', { forMember: mine.member })
      await mine.put(oatMilk)
      // A housemate reads it and gets it, in their own name.
      const housemate = asMember(mine.house.id, mine.admin)
      const seen = await h.uow.run(housemate, (r) => r.items.get(oatMilk.id))
      expect(seen?.category === 'need' && seen.forMember).toBe(mine.member)
      await h.uow.run(housemate, (r) =>
        r.items.save({ ...seen!, done: { at: T, by: mine.admin } } as Item),
      )
      expect(await mine.get(oatMilk.id)).toEqual({ ...oatMilk, done: { at: T, by: mine.admin } })
      // Another house sees none of it, and can't give it to one of theirs.
      const stranger = asMember(theirs.house.id, theirs.member)
      expect(await h.uow.run(stranger, (r) => r.items.get(oatMilk.id))).toBeUndefined()
      expect(await h.uow.run(stranger, (r) => r.items.openNeeds(mine.house.id))).toEqual([])
      await expect(
        h.uow.run(stranger, (r) =>
          r.items.save({ ...seen!, forMember: theirs.member, createdBy: theirs.member } as Item),
        ),
      ).rejects.toBeInstanceOf(AccessDenied)
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

    it('titles are 1–120 characters, and a chore repeats every 1–365 days', async () => {
      const { need, put } = await setup()
      await expect(put(need('   '))).rejects.toBeInstanceOf(ConstraintViolation)
      await expect(put(need('x'.repeat(121)))).rejects.toBeInstanceOf(ConstraintViolation)
      await put(need('x'.repeat(120)))
      const chore = (title: string, repeatDays: number | null) =>
        ({ ...need(title), category: 'chore', repeatDays }) as unknown as Item
      await put(chore('Water the plants', 365))
      await put(chore('Descale the kettle', null))
      for (const days of [0, 366]) {
        await expect(put(chore(`Every ${days}`, days))).rejects.toBeInstanceOf(ConstraintViolation)
      }
    })

    it('keeps one current feeling per member per item, in their own name', async () => {
      const { house, member, admin, need, put } = await setup()
      const n = need('Radiator parts')
      await put(n)
      const me = asMember(house.id, member)
      const anxious = {
        itemId: n.id,
        by: member,
        kind: 'anxious' as const,
        note: 'It bangs at 3am',
        at: T,
      }
      await h.uow.run(me, (r) => r.feelings.save(house.id, anxious))
      expect(await h.uow.run(me, (r) => r.feelings.get(n.id, member))).toEqual(anxious)
      const thanks = { itemId: n.id, by: member, kind: 'thanks' as const, at: T }
      await h.uow.run(me, (r) => r.feelings.save(house.id, thanks))
      expect(await h.uow.run(me, (r) => r.feelings.get(n.id, member))).toEqual(thanks)
      await expect(
        h.uow.run(me, (r) => r.feelings.save(house.id, { ...thanks, by: admin })),
      ).rejects.toBeInstanceOf(AccessDenied)
      await h.uow.run(me, (r) => r.feelings.remove(n.id, member))
      expect(await h.uow.run(me, (r) => r.feelings.get(n.id, member))).toBeUndefined()
    })

    it("reads an item's newest event of a kind, with its changes, in its own house only", async () => {
      const mine = await setup()
      const theirs = await setup()
      const chore = (title: string) =>
        ({ ...mine.need(title), category: 'chore', repeatDays: 7 }) as unknown as Item
      const trash = chore('Trash')
      const mop = chore('Mop')
      await mine.put(trash)
      await mine.put(mop)
      const me = asMember(mine.house.id, mine.member)
      const done = (itemId: Item['id'], previous: unknown, next: unknown) => ({
        kind: 'chore.done' as const,
        itemId,
        changes: { lastDone: [previous, next] as const },
        actionId: h.ids.newId<'action'>(),
        by: mine.member,
      })
      const first = { at: T, by: mine.member }
      const second = { at: instant(T.epochMs + 60_000), by: mine.member }
      await h.uow.run(me, (r) =>
        r.events.record(
          mine.house.id,
          [done(trash.id, null, first), done(trash.id, first, second), done(mop.id, null, first)],
          T,
        ),
      )
      const last = await h.uow.run(me, (r) =>
        r.events.lastForItem(mine.house.id, trash.id, 'chore.done'),
      )
      expect(last).toMatchObject({
        kind: 'chore.done',
        itemId: trash.id,
        changes: { lastDone: [first, second] },
      })
      expect(
        await h.uow.run(me, (r) => r.events.lastForItem(mine.house.id, trash.id, 'chore.undone')),
      ).toBeUndefined()
      // Another house's member reads nothing of it.
      expect(
        await h.uow.run(asMember(theirs.house.id, theirs.member), (r) =>
          r.events.lastForItem(mine.house.id, trash.id, 'chore.done'),
        ),
      ).toBeUndefined()
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
      // A loaded copy (with its version) of another house's item is still theirs, not a conflict.
      const loaded = await h.uow.run(system(theirs.house.id), (r) => r.items.get(secret.id))
      await expect(
        h.uow.run(me, (r) => r.items.save({ ...loaded!, title: 'Spoiled' })),
      ).rejects.toBeInstanceOf(AccessDenied)
    })

    it('T50: a copy saved over a newer one is a Conflict, and the newer one stays (§7.5)', async () => {
      const { house, member, admin, need, put, get } = await setup()
      const milk = need('Milk')
      await put(milk)
      const wren = asMember(house.id, member)
      const kavya = asMember(house.id, admin)
      const load = (as: typeof wren) => h.uow.run(as, (r) => r.items.get(milk.id))
      const wrens = (await load(wren))!
      const kavyas = (await load(kavya))!
      expect(wrens.version).toEqual(expect.any(String))
      await h.uow.run(kavya, (r) => r.items.save({ ...kavyas, title: 'Oat milk' }))
      await expect(
        h.uow.run(wren, (r) => r.items.save({ ...wrens, note: 'the big one' })),
      ).rejects.toBeInstanceOf(Conflict)
      const now = await get(milk.id)
      expect(now).toMatchObject({ title: 'Oat milk' })
      expect(now).not.toHaveProperty('note')

      // Every save moves the version on, even two in quick succession.
      const latest = (await load(wren))!
      expect(latest.version).not.toEqual(wrens.version)
      await h.uow.run(wren, (r) => r.items.save({ ...latest, priority: 'high' }))
      await expect(
        h.uow.run(wren, (r) => r.items.save({ ...latest, note: 'the big one' })),
      ).rejects.toBeInstanceOf(Conflict)

      // One transaction can save the copy it loaded more than once.
      await h.uow.run(wren, async (r) => {
        const copy = (await r.items.get(milk.id))!
        await r.items.save({ ...copy, note: 'the big one' })
        await r.items.save({ ...copy, note: 'the big one', priority: 'urgent' })
      })
      expect(await get(milk.id)).toMatchObject({
        title: 'Oat milk',
        note: 'the big one',
        priority: 'urgent',
      })
    })

    it('T50: of two saves racing from the same copy, exactly one lands', async () => {
      const { house, member, admin, need, put, get } = await setup()
      const bulbs = need('Bulbs')
      await put(bulbs)
      const loaded = (await h.uow.run(system(house.id), (r) => r.items.get(bulbs.id)))!
      const results = await Promise.allSettled(
        (
          [
            [member, 'Bulbs (warm)'],
            [admin, 'Bulbs (cool)'],
          ] as const
        ).map(([who, title]) =>
          h.uow.run(asMember(house.id, who), (r) => r.items.save({ ...loaded, title })),
        ),
      )
      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
      const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
      expect(lost.reason).toBeInstanceOf(Conflict)
      const won = results[0]!.status === 'fulfilled' ? 'Bulbs (warm)' : 'Bulbs (cool)'
      expect(await get(bulbs.id)).toMatchObject({ title: won })
    })
  })
