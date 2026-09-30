// The notifications repository contract (T33): your own toggles, readable by housemates; the
// outbox written only for your own house, and in the same transaction as the use case.

import { beforeAll, describe, expect, it } from 'vitest'
import { AccessDenied, type UnitOfWork } from '../../app/ports'
import { withNotifications } from '../../app/notify'
import type { HouseId, ItemId } from '../../domain/ids'
import type { OutboxMessage } from '../../domain/notifications'
import { err } from '../../domain/result'
import { instant } from '../../domain/time'
import { asMember, seedHouse, system, type UnitOfWorkHarness } from './unit-of-work.contract'

const T = instant(Date.UTC(2026, 8, 29, 16, 0)) // noon in New York: not quiet hours

export type NotificationsHarness = UnitOfWorkHarness & {
  /** Reads a house's outbox, bypassing access rules. */
  outbox(houseId: HouseId): Promise<Pick<OutboxMessage, 'userId' | 'category' | 'title'>[]>
}

export const notificationsContract = (
  name: string,
  makeHarness: () => Promise<NotificationsHarness>,
) =>
  describe(`Notifications contract: ${name}`, () => {
    let h: NotificationsHarness
    let uow: UnitOfWork
    beforeAll(async () => {
      h = await makeHarness()
      uow = withNotifications(h.uow)
    })

    it('you change only your own toggles, and housemates can read them', async () => {
      const { house, admin, member } = await seedHouse(h)
      await h.uow.run(asMember(house.id, member), (r) =>
        r.notifications.setEnabled(member, 'polls', false),
      )
      await h.uow.run(asMember(house.id, member), (r) =>
        r.notifications.setEnabled(member, 'runs', false),
      )
      await h.uow.run(asMember(house.id, member), (r) =>
        r.notifications.setEnabled(member, 'runs', true),
      )
      const off = await h.uow.run(asMember(house.id, admin), (r) =>
        r.notifications.offFor([admin, member]),
      )
      expect([...off.entries()].map(([u, c]) => [u, [...c]])).toEqual([[member, ['polls']]])
      await expect(
        h.uow.run(asMember(house.id, admin), (r) =>
          r.notifications.setEnabled(member, 'people', false),
        ),
      ).rejects.toBeInstanceOf(AccessDenied)
      const stranger = await seedHouse(h)
      const hidden = await h.uow.run(asMember(stranger.house.id, stranger.member), (r) =>
        r.notifications.offFor([member]),
      )
      expect(hidden.size).toBe(0)
    })

    it('the outbox is written for your own house only', async () => {
      const { house, member } = await seedHouse(h)
      const other = await seedHouse(h)
      const message = (houseId: HouseId): OutboxMessage => ({
        userId: member,
        houseId,
        category: 'people',
        title: 'Hi',
        body: 'There',
        url: '/',
        sendAfter: T,
      })
      await h.uow.run(asMember(house.id, member), (r) =>
        r.notifications.enqueue([message(house.id)]),
      )
      expect(await h.outbox(house.id)).toEqual([
        expect.objectContaining({ userId: member, category: 'people', title: 'Hi' }),
      ])
      await expect(
        h.uow.run(asMember(house.id, member), (r) =>
          r.notifications.enqueue([message(other.house.id)]),
        ),
      ).rejects.toBeInstanceOf(AccessDenied)
    })

    it('browsers are yours: saved and read in your own name; the system sends', async () => {
      const { house, admin, member } = await seedHouse(h)
      const sub = (endpoint: string, userId = member) => ({
        id: h.ids.newId<'item'>() as string,
        userId,
        endpoint,
        keys: { p256dh: 'p', auth: 'a' },
        createdAt: T,
      })
      const endpoint = `https://push.example/${h.ids.newId()}`
      const me = asMember(house.id, member)
      await h.uow.run(me, (r) => r.pushSubscriptions.save(sub(endpoint)))
      // The same browser again only refreshes it.
      await h.uow.run(me, (r) =>
        r.pushSubscriptions.save({ ...sub(endpoint), keys: { p256dh: 'p2', auth: 'a2' } }),
      )
      await expect(
        h.uow.run(me, (r) => r.pushSubscriptions.save(sub(`${endpoint}-x`, admin))),
      ).rejects.toBeInstanceOf(AccessDenied)
      const mine = await h.uow.run(me, (r) => r.pushSubscriptions.forUsers([member, admin]))
      expect(mine.map((x) => [x.endpoint, x.keys.p256dh])).toEqual([[endpoint, 'p2']])
      expect(
        await h.uow.run(asMember(house.id, admin), (r) => r.pushSubscriptions.forUsers([member])),
      ).toEqual([])

      const sys = system(house.id)
      const [found] = await h.uow.run(sys, (r) => r.pushSubscriptions.forUsers([member]))
      await h.uow.run(sys, (r) => r.pushSubscriptions.markOk(found!.id, T))
      await h.uow.run(sys, (r) => r.pushSubscriptions.markGone(found!.id, T))
      expect(await h.uow.run(sys, (r) => r.pushSubscriptions.forUsers([member]))).toEqual([])
      // Turning notifications on again brings the browser back.
      await h.uow.run(me, (r) => r.pushSubscriptions.save(sub(endpoint)))
      expect(await h.uow.run(sys, (r) => r.pushSubscriptions.forUsers([member]))).toHaveLength(1)
    })

    it('members see only their own messages; only the system marks them sent', async () => {
      const { house, admin, member } = await seedHouse(h)
      const later = instant(T.epochMs + 60 * 60 * 1000)
      await h.uow.run(asMember(house.id, member), (r) =>
        r.notifications.enqueue([
          {
            userId: member,
            houseId: house.id,
            category: 'people',
            title: 'Now',
            body: '',
            url: '/',
            sendAfter: T,
          },
          {
            userId: member,
            houseId: house.id,
            category: 'people',
            title: 'Later',
            body: '',
            url: '/',
            sendAfter: later,
          },
        ]),
      )
      const own = await h.uow.run(asMember(house.id, member), (r) => r.notifications.pending(T, 10))
      expect(own.map((m) => [m.userId, m.title])).toEqual([[member, 'Now']])
      const theirs = await h.uow.run(asMember(house.id, admin), (r) =>
        r.notifications.pending(T, 10),
      )
      expect(theirs.filter((m) => m.houseId === house.id)).toEqual([])
      await expect(
        h.uow.run(asMember(house.id, member), (r) => r.notifications.markSent(own[0]!.id, T, null)),
      ).rejects.toBeInstanceOf(Error)
      const sys = system(house.id)
      const due = (await h.uow.run(sys, (r) => r.notifications.pending(T, 1000))).filter(
        (m) => m.houseId === house.id,
      )
      expect(due.map((m) => m.title)).toEqual(['Now'])
      await h.uow.run(sys, (r) => r.notifications.markSent(due[0]!.id, T, null))
      const after = (await h.uow.run(sys, (r) => r.notifications.pending(later, 1000))).filter(
        (m) => m.houseId === house.id,
      )
      expect(after.map((m) => m.title)).toEqual(['Later'])
    })

    it('messages are written with the events, and rolled back with them', async () => {
      const { house, admin, member } = await seedHouse(h)
      const item = {
        id: h.ids.newId<'item'>() as ItemId,
        houseId: house.id,
        category: 'task' as const,
        title: 'Fix the latch',
        priority: 'normal' as const,
        assignee: member,
        createdBy: admin,
        createdAt: T,
      }
      await h.uow.run(system(house.id), (r) => r.items.save(item))
      const assign = {
        kind: 'item.assigned' as const,
        itemId: item.id,
        memberId: member,
        changes: {},
        actionId: h.ids.newId<'action'>(),
        by: admin,
      }
      // A use case that fails after recording writes nothing.
      await uow.run(asMember(house.id, admin), async (r) => {
        await r.events.record(house.id, [assign], T)
        return err('changed_my_mind')
      })
      expect(await h.outbox(house.id)).toEqual([])
      await uow.run(asMember(house.id, admin), (r) => r.events.record(house.id, [assign], T))
      expect(await h.outbox(house.id)).toEqual([
        { userId: member, category: 'assigned', title: 'For you: Fix the latch' },
      ])
    })
  })
