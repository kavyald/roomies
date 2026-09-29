'use server'

import {
  makeArchiveItem,
  makeCreateItem,
  makeDoChore,
  makeEditItem,
  makeMarkDone,
  makeReopenItem,
  makeRestoreItem,
} from '@/lib/app/items'
import { depsForRequest } from '@/lib/compose'
import type { HouseId, ItemId } from '@/lib/domain/ids'
import type { ItemPatch, NewItem } from '@/lib/domain/items'
import { itemIdSchema, itemPatchSchema, newItemSchema } from '@/lib/schemas/items'
import { makeAction } from '@/lib/server/action'
import { currentActor } from '@/lib/server/session'

const env = (houseId: HouseId) => ({
  currentActor: () => currentActor(houseId),
  deps: (actor: Parameters<typeof depsForRequest>[0]['actor']) => depsForRequest({ actor }),
})

// Zod has checked the shapes; the branded ids and local dates are just those strings.
export async function createItemAction(houseId: HouseId, input: unknown) {
  return makeAction(
    newItemSchema,
    (deps, actor, i) => makeCreateItem(deps)(actor, i as NewItem),
    env(houseId),
  )(input)
}

export async function editItemAction(houseId: HouseId, input: unknown) {
  return makeAction(
    itemPatchSchema,
    (deps, actor, i) =>
      makeEditItem(deps)(actor, { id: i.id as ItemId, patch: i.patch as ItemPatch }),
    env(houseId),
  )(input)
}

export async function markDoneAction(houseId: HouseId, id: unknown) {
  return makeAction(
    itemIdSchema,
    (deps, actor, i) => makeMarkDone(deps)(actor, i as ItemId),
    env(houseId),
  )(id)
}
export async function reopenItemAction(houseId: HouseId, id: unknown) {
  return makeAction(
    itemIdSchema,
    (deps, actor, i) => makeReopenItem(deps)(actor, i as ItemId),
    env(houseId),
  )(id)
}
export async function doChoreAction(houseId: HouseId, id: unknown) {
  return makeAction(
    itemIdSchema,
    (deps, actor, i) => makeDoChore(deps)(actor, i as ItemId),
    env(houseId),
  )(id)
}
export async function archiveItemAction(houseId: HouseId, id: unknown) {
  return makeAction(
    itemIdSchema,
    (deps, actor, i) => makeArchiveItem(deps)(actor, i as ItemId),
    env(houseId),
  )(id)
}
export async function restoreItemAction(houseId: HouseId, id: unknown) {
  return makeAction(
    itemIdSchema,
    (deps, actor, i) => makeRestoreItem(deps)(actor, i as ItemId),
    env(houseId),
  )(id)
}
