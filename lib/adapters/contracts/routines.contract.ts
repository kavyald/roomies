// The routines contract (T96): routines and a chore's rooms round-trip the same on memory and
// Postgres, a stale copy is a Conflict, and everything stays in its own house.

import { beforeAll, describe, expect, it } from 'vitest'
import { AccessDenied, Conflict, ConstraintViolation } from '../../app/ports'
import type { Room } from '../../domain/house'
import type { Chore } from '../../domain/items'
import type { Routine } from '../../domain/routines'
import { instant, type LocalDate } from '../../domain/time'
import { asMember, seedHouse, system, type UnitOfWorkHarness } from './unit-of-work.contract'

const T = instant(Date.UTC(2026, 10, 5, 16, 0))
const unversioned = <V extends { version?: unknown }>({ version: _v, ...rest }: V) => rest

export const routinesContract = (name: string, makeHarness: () => Promise<UnitOfWorkHarness>) =>
  describe(`Routines contract: ${name}`, () => {
    let h: UnitOfWorkHarness
    beforeAll(async () => {
      h = await makeHarness()
    })

    const setup = async () => {
      const seeded = await seedHouse(h)
      const me = asMember(seeded.house.id, seeded.member)
      const routine = (o: Partial<Routine> = {}): Routine => ({
        id: h.ids.newId(),
        houseId: seeded.house.id,
        name: 'Kitchen and dining',
        icon: 'utensils',
        resets: 'biweekly',
        startsOn: '2026-11-02' as LocalDate,
        startsWith: seeded.member,
        sortOrder: 2,
        createdAt: T,
        ...o,
      })
      const room = (nameOf: string, o: Partial<Room> = {}): Room => ({
        id: h.ids.newId(),
        houseId: seeded.house.id,
        name: nameOf,
        floor: 'first',
        kind: 'common',
        sortOrder: 1,
        ...o,
      })
      const chore = (o: Partial<Chore> = {}): Chore => ({
        id: h.ids.newId(),
        houseId: seeded.house.id,
        category: 'chore',
        title: 'Vacuum',
        priority: 'normal',
        kind: 'deep_clean',
        rooms: [],
        createdBy: seeded.member,
        createdAt: T,
        ...o,
      })
      return { ...seeded, me, routine, room, chore }
    }

    it('a routine round-trips, with its dates as local dates, and lists in order', async () => {
      const s = await setup()
      const r = s.routine()
      const fixed = s.routine({
        name: 'Garden',
        icon: 'leaf',
        resets: 'monthly',
        startsWith: undefined,
        fixedMember: s.admin,
        sortOrder: 1,
        startsOn: '2026-11-01' as LocalDate,
      })
      const { startsWith: _s, ...fixedWithout } = fixed
      await h.uow.run(s.me, async (repos) => {
        await repos.routines.save(r)
        await repos.routines.save(fixedWithout)
      })
      const got = await h.uow.run(s.me, (repos) => repos.routines.get(r.id))
      expect(unversioned(got!)).toEqual(r)
      expect(got!.version).toBeTruthy()
      const list = await h.uow.run(s.me, (repos) => repos.routines.listByHouse(s.house.id))
      expect(list.map((x) => x.name)).toEqual(['Garden', 'Kitchen and dining'])
      expect(unversioned(list[0]!)).toEqual(fixedWithout)
    })

    it('saving a stale copy is a conflict; removing keeps it listed for the repo', async () => {
      const s = await setup()
      const r = s.routine()
      await h.uow.run(s.me, (repos) => repos.routines.save(r))
      const loaded = (await h.uow.run(s.me, (repos) => repos.routines.get(r.id)))!
      await h.uow.run(s.me, (repos) => repos.routines.save({ ...loaded, name: 'First' }))
      await expect(
        h.uow.run(s.me, (repos) => repos.routines.save({ ...loaded, name: 'Second' })),
      ).rejects.toBeInstanceOf(Conflict)
      const fresh = (await h.uow.run(s.me, (repos) => repos.routines.get(r.id)))!
      await h.uow.run(s.me, (repos) => repos.routines.save({ ...fresh, removedAt: T }))
      const list = await h.uow.run(s.me, (repos) => repos.routines.listByHouse(s.house.id))
      expect(list[0]!.removedAt).toEqual(T)
    })

    it('refuses a bad name, and a routine nobody has', async () => {
      const s = await setup()
      await expect(
        h.uow.run(s.me, (repos) => repos.routines.save(s.routine({ name: ' ' }))),
      ).rejects.toBeInstanceOf(ConstraintViolation)
      const { startsWith: _s, ...nobody } = s.routine()
      await expect(h.uow.run(s.me, (repos) => repos.routines.save(nobody))).rejects.toBeInstanceOf(
        ConstraintViolation,
      )
    })

    it('a room carries its routine, set and cleared; only one of this house', async () => {
      const s = await setup()
      const other = await setup()
      const r = s.routine()
      const kitchen = s.room('Kitchen')
      await h.uow.run(s.me, async (repos) => {
        await repos.routines.save(r)
        await repos.rooms.save({ ...kitchen, routineId: r.id })
      })
      expect(await h.uow.run(s.me, (repos) => repos.rooms.get(kitchen.id))).toEqual({
        ...kitchen,
        routineId: r.id,
      })
      await h.uow.run(s.me, (repos) => repos.rooms.save(kitchen))
      expect(await h.uow.run(s.me, (repos) => repos.rooms.get(kitchen.id))).toEqual(kitchen)
      const theirs = other.routine()
      await h.uow.run(other.me, (repos) => repos.routines.save(theirs))
      await expect(
        h.uow.run(system(s.house.id), (repos) =>
          repos.rooms.save({ ...kitchen, routineId: theirs.id }),
        ),
      ).rejects.toBeInstanceOf(ConstraintViolation)
    })

    it("a chore's rooms, kind and icon round-trip, and its rooms can change", async () => {
      const s = await setup()
      const [a, b, c] = [s.room('A'), s.room('B'), s.room('C')]
      const rooms = [a.id, b.id].sort()
      const vacuum = s.chore({ icon: 'broom', rooms })
      await h.uow.run(s.me, async (repos) => {
        for (const x of [a, b, c]) await repos.rooms.save(x)
        await repos.items.save(vacuum)
      })
      const got = (await h.uow.run(s.me, (repos) => repos.items.get(vacuum.id))) as Chore
      expect(unversioned(got)).toEqual(vacuum)
      const listed = await h.uow.run(s.me, (repos) => repos.items.listByHouse(s.house.id))
      expect((listed.find((i) => i.id === vacuum.id) as Chore).rooms).toEqual(rooms)

      await h.uow.run(s.me, (repos) => repos.items.save({ ...got, rooms: [c.id], kind: 'upkeep' }))
      const after = (await h.uow.run(s.me, (repos) => repos.items.get(vacuum.id))) as Chore
      expect(after.rooms).toEqual([c.id])
      expect(after.kind).toBe('upkeep')

      await h.uow.run(s.me, (repos) => repos.items.save({ ...after, rooms: [] }))
      const none = (await h.uow.run(s.me, (repos) => repos.items.get(vacuum.id))) as Chore
      expect(none.rooms).toEqual([])
    })

    it("a chore's rooms are its own house's; icon and kind are for chores", async () => {
      const s = await setup()
      const other = await setup()
      const theirs = other.room('Theirs')
      await h.uow.run(other.me, (repos) => repos.rooms.save(theirs))
      await expect(
        h.uow.run(s.me, (repos) => repos.items.save(s.chore({ rooms: [theirs.id] }))),
      ).rejects.toBeInstanceOf(ConstraintViolation)
      const need = {
        ...s.chore(),
        category: 'need',
        rooms: undefined,
      } as unknown as Chore
      await expect(h.uow.run(s.me, (repos) => repos.items.save(need))).rejects.toBeInstanceOf(
        ConstraintViolation,
      )
    })

    it("another house's routines stay out of reach", async () => {
      const s = await setup()
      const other = await setup()
      const r = other.routine()
      await h.uow.run(other.me, (repos) => repos.routines.save(r))
      expect(await h.uow.run(s.me, (repos) => repos.routines.get(r.id))).toBeUndefined()
      expect(await h.uow.run(s.me, (repos) => repos.routines.listByHouse(other.house.id))).toEqual(
        [],
      )
      await expect(
        h.uow.run(s.me, (repos) => repos.routines.save(other.routine())),
      ).rejects.toBeInstanceOf(AccessDenied)
    })
  })
