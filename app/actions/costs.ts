'use server'

import { houseEnv } from './env'
import { makeAddCost, makeCopiedToSplitwise, makeEditCost, makeRemoveCost } from '@/lib/app/costs'
import type { CostId, HouseId, ItemId, RunId, UserId } from '@/lib/domain/ids'
import type { Cents } from '@/lib/domain/money'
import { addCostSchema, costIdSchema, editCostSchema } from '@/lib/schemas/costs'
import { makeAction } from '@/lib/server/action'

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
    houseEnv(houseId),
  )(input)
}

export async function copiedToSplitwiseAction(houseId: HouseId, input: unknown) {
  return makeAction(
    costIdSchema,
    (deps, actor, i) => makeCopiedToSplitwise(deps)(actor, { costId: i.costId as CostId }),
    houseEnv(houseId),
  )(input)
}

export async function editCostAction(houseId: HouseId, input: unknown) {
  return makeAction(
    editCostSchema,
    (deps, actor, i) =>
      makeEditCost(deps)(actor, {
        costId: i.costId as CostId,
        ...(i.amount !== undefined && { amount: i.amount as Cents }),
        ...(i.paidBy && { paidBy: i.paidBy as UserId }),
        ...(i.note !== undefined && { note: i.note }),
      }),
    houseEnv(houseId),
  )(input)
}

export async function removeCostAction(houseId: HouseId, input: unknown) {
  return makeAction(
    costIdSchema,
    (deps, actor, i) => makeRemoveCost(deps)(actor, { costId: i.costId as CostId }),
    houseEnv(houseId),
  )(input)
}
