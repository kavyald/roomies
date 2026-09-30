// Cost use cases (PRD §6.6): record a cost for an item, a run, or nothing; note a Splitwise copy.

import type { AppDeps, Repos } from './ports'
import { actorUser, type HouseActor } from '../domain/actor'
import { addCost, copiedToSplitwise, type CostFor, type NewCost } from '../domain/costs'
import type { CostId, UserId } from '../domain/ids'
import { err, ok } from '../domain/result'

type Deps = Pick<AppDeps, 'uow' | 'clock' | 'ids'>

/** Who paid is an active member, and what it was for belongs to this house. */
export const checkCostRefs = async (
  repos: Repos,
  actor: HouseActor,
  input: { paidBy?: UserId; for?: CostFor },
): Promise<'unknown_member' | 'not_found' | null> => {
  if (input.paidBy) {
    const m = await repos.members.get(actor.houseId, input.paidBy)
    if (!m?.status.active) return 'unknown_member'
  }
  const f = input.for
  if (f && 'item' in f && (await repos.items.get(f.item))?.houseId !== actor.houseId)
    return 'not_found'
  if (f && 'run' in f && (await repos.runs.get(f.run))?.houseId !== actor.houseId)
    return 'not_found'
  return null
}

/** "Add cost" on an item, or a cost on its own. */
export const makeAddCost =
  ({ uow, clock, ids }: Deps) =>
  (actor: HouseActor, input: NewCost) =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      if (!by) return err('not_found')
      const bad = await checkCostRefs(repos, actor, input)
      if (bad) return err(bad)
      const now = clock.now()
      const r = addCost(input, {
        by,
        now,
        id: ids.newId(),
        houseId: actor.houseId,
        actionId: ids.newId(),
      })
      if (!r.ok) return r
      await repos.costs.add(r.value.cost)
      await repos.events.record(actor.houseId, r.value.events, now)
      return ok(r.value.cost)
    })

/** "Open Splitwise" copied it: noted in the history. */
export const makeCopiedToSplitwise =
  ({ uow, clock, ids }: Deps) =>
  (actor: HouseActor, input: { costId: CostId }) =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      const cost = (await repos.costs.listByHouse(actor.houseId)).find((c) => c.id === input.costId)
      if (!cost || !by) return err('not_found')
      await repos.events.record(
        actor.houseId,
        [copiedToSplitwise(cost, { by, actionId: ids.newId() })],
        clock.now(),
      )
      return ok(cost)
    })
