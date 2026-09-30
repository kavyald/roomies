// Scheduled jobs (ARCHITECTURE §8), run by pg_cron through /api/cron as Roomies (the system
// actor). Each walks every house in its own transaction, with an injected clock, and is safe to run
// twice: reminders carry dedupe keys; closing a closed poll is a no-op.

import { houseAudience } from './notify'
import type { AppDeps } from './ports'
import type { Actor } from '../domain/actor'
import { asId, type HouseId } from '../domain/ids'
import { deliver } from '../domain/notifications'
import { closePoll } from '../domain/polls'
import { remindersFor } from '../domain/reminders'
import { ok } from '../domain/result'
import { runLabel } from '../domain/runs'

type Deps = Pick<AppDeps, 'uow' | 'clock' | 'ids'>

const system = (houseId: HouseId): Actor => ({ kind: 'system', houseId })
const EVERY_HOUSE = system(asId<'house'>('00000000-0000-0000-0000-000000000000') as HouseId)

/** Due tasks and chores, polls closing tomorrow, and runs dated tomorrow, into the outbox. */
export const makeRunReminders =
  ({ uow, clock }: Pick<Deps, 'uow' | 'clock'>) =>
  async () => {
    const now = clock.now()
    const houses = await uow.run(EVERY_HOUSE, (r) => r.houses.listAll())
    let enqueued = 0
    for (const house of houses) {
      enqueued += await uow.run(system(house.id), async (repos) => {
        const audience = await houseAudience(repos, house.id)
        if (!audience) return 0
        const [items, polls, runs] = await Promise.all([
          repos.items.listByHouse(house.id),
          repos.polls.listByHouse(house.id),
          repos.runs.listByHouse(house.id),
        ])
        const drafts = remindersFor({
          houseId: house.id,
          tz: audience.tz,
          now,
          items,
          polls,
          runs,
          people: audience.people,
          runLabel: (r) => runLabel(r, audience.labels),
        })
        const ctx = { houseId: house.id, houseTz: audience.tz, now, people: audience.people }
        return repos.notifications.enqueue(deliver(drafts, ctx))
      })
    }
    return ok({ houses: houses.length, enqueued })
  }

/** Closes polls whose deadline has passed and records the result (which tells the house). */
export const makeCloseDuePolls =
  ({ uow, clock, ids }: Deps) =>
  async () => {
    const now = clock.now()
    const houses = await uow.run(EVERY_HOUSE, (r) => r.houses.listAll())
    let closed = 0
    for (const house of houses) {
      closed += await uow.run(system(house.id), async (repos) => {
        const due = (await repos.polls.listByHouse(house.id)).filter(
          (p) => p.state.open && p.closesAt && p.closesAt.epochMs <= now.epochMs,
        )
        for (const poll of due) {
          const r = closePoll(poll, { by: null, now, actionId: ids.newId() })
          if (!r.ok) continue
          await repos.polls.saveState(r.value.poll)
          await repos.events.record(house.id, r.value.events, now)
        }
        return due.length
      })
    }
    return ok({ closed })
  }
