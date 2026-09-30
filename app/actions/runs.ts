'use server'

import {
  makeAddToRun,
  makeFinishRun,
  makeMarkRunItemsDone,
  makeMoveRunItems,
  makeReturnToPool,
  makeStartRun,
} from '@/lib/app/runs'
import { depsForRequest } from '@/lib/compose'
import type { HouseId, ItemId, RunId, UserId } from '@/lib/domain/ids'
import type { When } from '@/lib/domain/time'
import {
  addToRunSchema,
  finishRunSchema,
  moveRunItemsSchema,
  returnToPoolSchema,
  runItemsSchema,
  startRunSchema,
} from '@/lib/schemas/runs'
import { makeAction } from '@/lib/server/action'
import { currentActor } from '@/lib/server/session'

const env = (houseId: HouseId) => ({
  currentActor: () => currentActor(houseId),
  deps: (actor: Parameters<typeof depsForRequest>[0]['actor']) => depsForRequest({ actor }),
})

// Zod has checked the shapes; the branded ids and local dates are just those strings.
const itemIds = (ids: string[]) => ids as ItemId[]

export async function startRunAction(houseId: HouseId, input: unknown) {
  return makeAction(
    startRunSchema,
    (deps, actor, i) =>
      makeStartRun(deps)(actor, {
        title: i.title,
        when: i.when as When | undefined,
        runner: i.runner as UserId | undefined,
        itemIds: itemIds(i.itemIds),
      }),
    env(houseId),
  )(input)
}

export async function addToRunAction(houseId: HouseId, input: unknown) {
  return makeAction(
    addToRunSchema,
    (deps, actor, i) =>
      makeAddToRun(deps)(actor, { runId: i.runId as RunId, itemIds: itemIds(i.itemIds) }),
    env(houseId),
  )(input)
}

export async function markRunItemsDoneAction(houseId: HouseId, input: unknown) {
  return makeAction(
    runItemsSchema,
    (deps, actor, i) =>
      makeMarkRunItemsDone(deps)(actor, { runId: i.runId as RunId, itemIds: itemIds(i.itemIds) }),
    env(houseId),
  )(input)
}

export async function moveRunItemsAction(houseId: HouseId, input: unknown) {
  return makeAction(
    moveRunItemsSchema,
    (deps, actor, i) =>
      makeMoveRunItems(deps)(actor, {
        fromRunId: i.fromRunId as RunId,
        toRunId: i.toRunId as RunId,
        itemIds: itemIds(i.itemIds),
        note: i.note,
      }),
    env(houseId),
  )(input)
}

export async function returnToPoolAction(houseId: HouseId, input: unknown) {
  return makeAction(
    returnToPoolSchema,
    (deps, actor, i) =>
      makeReturnToPool(deps)(actor, {
        runId: i.runId as RunId,
        itemIds: itemIds(i.itemIds),
        note: i.note,
        clearContact: i.clearContact,
      }),
    env(houseId),
  )(input)
}

export async function finishRunAction(houseId: HouseId, input: unknown) {
  return makeAction(
    finishRunSchema,
    (deps, actor, i) => makeFinishRun(deps)(actor, { runId: i.runId as RunId }),
    env(houseId),
  )(input)
}
