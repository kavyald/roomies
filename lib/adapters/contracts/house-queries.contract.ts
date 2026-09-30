// The HouseQueries contract: the read side returns domain types, scoped by access rules.
// Run against memory (unit) and the Supabase browser adapter (db, through PostgREST + RLS).

import { beforeAll, describe, expect, it } from 'vitest'
import type { HouseQueries } from '../../app/ports'
import type { Contact, Room } from '../../domain/house'
import type { HouseId, UserId } from '../../domain/ids'
import type { DomainEvent } from '../../domain/events'
import { instant } from '../../domain/time'
import { seedHouse, system, type UnitOfWorkHarness } from './unit-of-work.contract'

const T = instant(Date.UTC(2026, 8, 29, 16, 0))

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

    it('reads items with their dates as the house sees them', async () => {
      const { house, member } = await withPlaces()
      const item = {
        id: h.ids.newId<'item'>(),
        houseId: house.id,
        category: 'task',
        title: 'Fix the latch',
        priority: 'normal',
        when: { date: '2026-11-01', time: '01:30' }, // the repeated hour at fall-back
        createdBy: member,
        createdAt: T,
      } as const
      await h.uow.run(system(house.id), (r) => r.items.save(item as never))
      expect(await h.queriesFor(member, house.id).items(house.id)).toEqual([item])
      const stranger = await seedHouse(h)
      expect(await h.queriesFor(stranger.member, stranger.house.id).items(house.id)).toEqual([])
    })

    it("reads the house's feelings and an item's activity", async () => {
      const { house, member } = await withPlaces()
      const item = {
        id: h.ids.newId<'item'>(),
        houseId: house.id,
        category: 'need',
        title: 'Soap',
        priority: 'normal',
        createdBy: member,
        createdAt: T,
      } as const
      const feeling = { itemId: item.id, by: member, kind: 'frustrated' as const, at: T }
      await h.uow.run(system(house.id), async (r) => {
        await r.items.save(item as never)
        await r.feelings.save(house.id, feeling as never)
        await r.events.record(
          house.id,
          [
            {
              kind: 'feeling.set',
              itemId: item.id as never,
              changes: { previous: null, next: feeling as never },
              actionId: h.ids.newId(),
              by: member,
            },
          ],
          T,
        )
      })
      const q = h.queriesFor(member, house.id)
      expect(await q.feelings(house.id)).toEqual([feeling])
      const rows = await q.itemActivity(house.id, item.id as never)
      expect(rows.map((r) => r.kind)).toEqual(['feeling.set'])
      const stranger = await seedHouse(h)
      expect(await h.queriesFor(stranger.member, stranger.house.id).feelings(house.id)).toEqual([])
    })

    it('shows invites to admins only', async () => {
      const { house, admin, member } = await withPlaces()
      const invite = {
        id: h.ids.newId<'invite'>(),
        houseId: house.id,
        tokenHash: `q-${h.ids.newId()}`,
        createdBy: admin,
        expiresAt: T,
        maxUses: 2,
        uses: 1,
      } as const
      await h.uow.run(system(house.id), (r) => r.invites.save(invite as never))
      expect(await h.queriesFor(admin, house.id).invites(house.id)).toEqual([invite])
      expect(await h.queriesFor(member, house.id).invites(house.id)).toEqual([])
    })

    it('pages activity newest first, never splitting an action', async () => {
      const { house, admin, member } = await withPlaces()
      const alone = (): DomainEvent => ({
        kind: 'house.created',
        actionId: h.ids.newId(),
        by: admin,
      })
      const bulk = h.ids.newId<'action'>()
      const joined = (who: UserId): DomainEvent => ({
        kind: 'member.joined',
        memberId: who,
        actionId: bulk as never,
        by: admin,
      })
      await h.uow.run(system(house.id), async (r) => {
        await r.events.record(house.id, [alone()], T) // oldest
        await r.events.record(house.id, [joined(admin), joined(member), joined(admin)], T)
        await r.events.record(house.id, [alone()], T) // newest
      })

      const q = h.queriesFor(member, house.id)
      const first = await q.activity(house.id, { limit: 2 })
      expect(first.rows.map((r) => r.kind)).toEqual([
        'house.created',
        'member.joined',
        'member.joined',
        'member.joined',
      ])
      expect(first.before).not.toBeNull()
      const second = await q.activity(house.id, { before: first.before!, limit: 2 })
      expect(second).toEqual({
        rows: [expect.objectContaining({ kind: 'house.created' })],
        before: null,
      })
    })

    it("reads the house's polls with their options and votes", async () => {
      const { house, admin, member } = await withPlaces()
      const poll = {
        id: h.ids.newId<'poll'>(),
        houseId: house.id,
        question: 'House name?',
        options: [
          { id: h.ids.newId<'option'>(), label: 'The Nest', addedBy: member, addedAt: T },
          { id: h.ids.newId<'option'>(), label: 'Burrow', addedBy: member, addedAt: T },
        ],
        votes: [] as { user: typeof admin; option: string; at: typeof T }[],
        createdBy: member,
        createdAt: T,
        state: { open: true as const },
      }
      await h.uow.run(system(house.id), async (r) => {
        await r.polls.create(poll as never)
        await r.polls.setVote(poll as never, { user: admin, option: poll.options[1]!.id, at: T })
      })
      const [read] = await h.queriesFor(member, house.id).polls(house.id)
      expect(read).toMatchObject({
        question: 'House name?',
        options: [{ label: 'The Nest' }, { label: 'Burrow' }],
        votes: [{ user: admin, option: poll.options[1]!.id }],
      })
      const stranger = await seedHouse(h)
      expect(await h.queriesFor(stranger.member, stranger.house.id).polls(house.id)).toEqual([])
    })

    it("reads the house's runs and a run's story, including items moved into it", async () => {
      const { house, member } = await withPlaces()
      const run = (title: string) => ({
        id: h.ids.newId<'run'>(),
        houseId: house.id,
        kind: 'batch' as const,
        title,
        runner: member,
        createdBy: member,
        createdAt: T,
        state: { open: true as const },
      })
      const groceries = run('Groceries')
      const saturday = run('Saturday')
      const item = {
        id: h.ids.newId<'item'>(),
        houseId: house.id,
        category: 'need',
        title: 'Milk',
        priority: 'normal',
        createdBy: member,
        createdAt: T,
      } as const
      await h.uow.run(system(house.id), async (r) => {
        await r.runs.save(groceries)
        await r.runs.save(saturday)
        await r.items.save({ ...item, run: { id: saturday.id, kind: 'batch' } } as never)
        const a = h.ids.newId<'action'>()
        await r.events.record(
          house.id,
          [
            {
              kind: 'run.item_added',
              runId: groceries.id,
              itemId: item.id,
              actionId: a,
              by: member,
            },
            {
              kind: 'run.item_moved',
              runId: groceries.id,
              toRunId: saturday.id,
              itemId: item.id,
              actionId: a,
              by: member,
            },
          ],
          T,
        )
      })
      const q = h.queriesFor(member, house.id)
      expect((await q.runs(house.id)).map((r) => r.title).sort()).toEqual(['Groceries', 'Saturday'])
      expect((await q.runActivity(house.id, groceries.id)).map((r) => r.kind)).toEqual([
        'run.item_added',
        'run.item_moved',
      ])
      expect((await q.runActivity(house.id, saturday.id)).map((r) => r.kind)).toEqual([
        'run.item_moved',
      ])
      const stranger = await seedHouse(h)
      const theirs = h.queriesFor(stranger.member, stranger.house.id)
      expect(await theirs.runs(house.id)).toEqual([])
      expect(await theirs.runActivity(house.id, groceries.id)).toEqual([])
    })

    it('finds the latest activity of one kind', async () => {
      const { house, admin, member } = await withPlaces()
      const weights = (anxious: number): DomainEvent => ({
        kind: 'settings.feeling_weights_changed',
        changes: { anxious: [20, anxious] },
        actionId: h.ids.newId(),
        by: admin,
      })
      const q = h.queriesFor(member, house.id)
      expect(await q.latestActivity(house.id, 'settings.feeling_weights_changed')).toBeUndefined()
      await h.uow.run(system(house.id), async (r) => {
        await r.events.record(house.id, [weights(30)], T)
        await r.events.record(house.id, [weights(40)], T)
        await r.events.record(
          house.id,
          [{ kind: 'house.created', actionId: h.ids.newId(), by: admin }],
          T,
        )
      })
      expect(await q.latestActivity(house.id, 'settings.feeling_weights_changed')).toMatchObject({
        kind: 'settings.feeling_weights_changed',
        changes: { anxious: [20, 40] },
      })
      const other = await seedHouse(h)
      expect(
        await h
          .queriesFor(other.member, other.house.id)
          .latestActivity(house.id, 'settings.feeling_weights_changed'),
      ).toBeUndefined()
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
      expect(await q.activity(house.id, { limit: 10 })).toEqual({ rows: [], before: null })
      expect(await q.invites(house.id)).toEqual([])
    })
  })
