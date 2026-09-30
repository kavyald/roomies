'use server'

import { makeAddCost, makeCopiedToSplitwise } from '@/lib/app/costs'
import { depsForRequest } from '@/lib/compose'
import type { CostId, HouseId, ItemId, RunId, UserId } from '@/lib/domain/ids'
import type { Cents } from '@/lib/domain/money'
import { addCostSchema, costIdSchema } from '@/lib/schemas/costs'
import { makeAction } from '@/lib/server/action'
import { currentActor } from '@/lib/server/session'

const env = (houseId: HouseId) => ({
  currentActor: () => currentActor(houseId),
  deps: (actor: Parameters<typeof depsForRequest>[0]['actor']) => depsForRequest({ actor }),
})

// Zod has checked the shapes; the branded ids and cents are just those values.
export async function addCostAction(houseId: HouseId, input: unknown) {
  return makeAction(
    addCostSchema,
    (deps, actor, i) =>
      makeAddCost(deps)(actor, {
        amount: i.amount as Cents,
        ...(i.paidBy && { paidBy: i.paidBy as UserId }),
        note: i.note,
        ...(i.itemId
          ? { for: { item: i.itemId as ItemId } }
          : i.runId
            ? { for: { run: i.runId as RunId } }
            : {}),
      }),
    env(houseId),
  )(input)
}

export async function copiedToSplitwiseAction(houseId: HouseId, input: unknown) {
  return makeAction(
    costIdSchema,
    (deps, actor, i) => makeCopiedToSplitwise(deps)(actor, { costId: i.costId as CostId }),
    env(houseId),
  )(input)
}
