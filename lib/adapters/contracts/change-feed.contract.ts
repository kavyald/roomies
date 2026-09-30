// The ChangeFeed contract (T26): what's committed in a house reaches that house's members, as the
// table it changed, and nothing from another house does. Run against memory (unit) and Supabase
// Realtime (db).

import { afterEach, describe, expect, it } from 'vitest'
import type { Change, ChangeFeed, Unsubscribe } from '../../app/ports'
import type { DomainEvent } from '../../domain/events'
import type { HouseId, UserId } from '../../domain/ids'
import { instant } from '../../domain/time'
import { seedHouse, system, type UnitOfWorkHarness } from './unit-of-work.contract'

const T = instant(Date.UTC(2026, 8, 29, 16, 0))

export type ChangeFeedHarness = UnitOfWorkHarness & {
  /** Listens as this user, the way the browser does. */
  feedFor(userId: UserId, houseId: HouseId): ChangeFeed
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const changeFeedContract = (name: string, make: () => Promise<ChangeFeedHarness>) =>
  describe(`ChangeFeed contract: ${name}`, () => {
    const stops: Unsubscribe[] = []
    afterEach(() => stops.splice(0).forEach((stop) => stop()))

    it("a member hears their house's changes, as the table that changed, and not another house's", async () => {
      const h = await make()
      const mine = await seedHouse(h)
      const theirs = await seedHouse(h)
      const heard: Change[] = []
      stops.push(
        h.feedFor(mine.member, mine.house.id).subscribe(mine.house.id, (c) => heard.push(c)),
      )

      const record = (
        houseId: HouseId,
        kind: 'house.created' | 'settings.feeling_weights_changed',
      ) =>
        h.uow.run(system(houseId), (r) =>
          r.events.record(
            houseId,
            [
              {
                kind,
                actionId: h.ids.newId(),
                by: null,
                ...(kind !== 'house.created' && { changes: {} }),
              } as DomainEvent,
            ],
            T,
          ),
        )

      // A subscription takes a moment to open; keep making changes until one is heard.
      for (let i = 0; i < 40 && heard.length === 0; i++) {
        await record(mine.house.id, 'house.created')
        await sleep(i === 0 ? 0 : 250)
      }
      expect(heard[0]).toEqual({ table: 'houses' })

      // Another house's change first, then ours: only ours arrives.
      heard.length = 0
      await record(theirs.house.id, 'house.created')
      await record(mine.house.id, 'settings.feeling_weights_changed')
      for (let i = 0; i < 40 && heard.length === 0; i++) await sleep(100)
      await sleep(300)
      expect(heard).toEqual([{ table: 'houses' }])
    })

    it('stops after unsubscribing', async () => {
      const h = await make()
      const { house, member } = await seedHouse(h)
      const heard: Change[] = []
      const stop = h.feedFor(member, house.id).subscribe(house.id, (c) => heard.push(c))
      stop()
      await h.uow.run(system(house.id), (r) =>
        r.events.record(
          house.id,
          [{ kind: 'house.created', actionId: h.ids.newId(), by: null }],
          T,
        ),
      )
      await sleep(500)
      expect(heard).toEqual([])
    })
  })
