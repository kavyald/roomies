'use server'

import { houseEnv } from './env'
import {
  makeArchiveItem,
  makeCreateItem,
  makeDoChore,
  makeEditItem,
  makeMarkDone,
  makeReopenItem,
  makeRestoreItem,
  makeSetFeeling,
} from '@/lib/app/items'
import type { HouseId, ItemId } from '@/lib/domain/ids'
import type { ItemPatch, NewItem } from '@/lib/domain/items'
import { itemIdSchema, itemPatchSchema, newItemSchema, setFeelingSchema } from '@/lib/schemas/items'
import { makeAction } from '@/lib/server/action'

// Zod has checked the shapes; the branded ids and local dates are just those strings.
export async function createItemAction(houseId: HouseId, input: unknown) {
  return makeAction(
    newItemSchema,
    (deps, actor, i) => makeCreateItem(deps)(actor, i as NewItem),
    houseEnv(houseId),
  )(input)
}

export async function editItemAction(houseId: HouseId, input: unknown) {
  return makeAction(
    itemPatchSchema,
    (deps, actor, i) =>
      makeEditItem(deps)(actor, { id: i.id as ItemId, patch: i.patch as ItemPatch }),
    houseEnv(houseId),
  )(input)
}

export async function markDoneAction(houseId: HouseId, id: unknown) {
  return makeAction(
    itemIdSchema,
    (deps, actor, i) => makeMarkDone(deps)(actor, i as ItemId),
    houseEnv(houseId),
  )(id)
}
export async function reopenItemAction(houseId: HouseId, id: unknown) {
  return makeAction(
    itemIdSchema,
    (deps, actor, i) => makeReopenItem(deps)(actor, i as ItemId),
    houseEnv(houseId),
  )(id)
}
export async function doChoreAction(houseId: HouseId, id: unknown) {
  return makeAction(
    itemIdSchema,
    (deps, actor, i) => makeDoChore(deps)(actor, i as ItemId),
    houseEnv(houseId),
  )(id)
}
export async function archiveItemAction(houseId: HouseId, id: unknown) {
  return makeAction(
    itemIdSchema,
    (deps, actor, i) => makeArchiveItem(deps)(actor, i as ItemId),
    houseEnv(houseId),
  )(id)
}
export async function restoreItemAction(houseId: HouseId, id: unknown) {
  return makeAction(
    itemIdSchema,
    (deps, actor, i) => makeRestoreItem(deps)(actor, i as ItemId),
    houseEnv(houseId),
  )(id)
}

export async function setFeelingAction(houseId: HouseId, input: unknown) {
  return makeAction(
    setFeelingSchema,
    (deps, actor, i) =>
      makeSetFeeling(deps)(actor, {
        itemId: i.itemId as ItemId,
        kind: i.kind,
        ...(i.note && { note: i.note }),
      }),
    houseEnv(houseId),
  )(input)
}
