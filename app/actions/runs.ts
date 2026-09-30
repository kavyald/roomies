'use server'

import {
  makeAddToRequest,
  makeAddToRun,
  makeHandToContact,
  makeMoveToNewVisit,
  makePlanVisit,
  makeSendRequest,
  makeSetVisitDate,
  makeStartRequest,
  makeFinishRun,
  makeMarkRunItemsDone,
  makeMoveRunItems,
  makeReturnToPool,
  makeStartRun,
} from '@/lib/app/runs'
import { depsForRequest } from '@/lib/compose'
import type { ContactId, HouseId, ItemId, RunId, UserId } from '@/lib/domain/ids'
import type { Cents } from '@/lib/domain/money'
import type { When } from '@/lib/domain/time'
import {
  addToRequestSchema,
  addToRunSchema,
  handToContactSchema,
  moveToNewVisitSchema,
  planVisitSchema,
  sendRequestSchema,
  setVisitDateSchema,
  startRequestSchema,
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
    (deps, actor, i) =>
      makeFinishRun(deps)(actor, {
        runId: i.runId as RunId,
        ...(i.spent !== undefined && { spent: i.spent as Cents }),
        ...(i.paidBy && { paidBy: i.paidBy as UserId }),
        note: i.note,
      }),
    env(houseId),
  )(input)
}

export async function startRequestAction(houseId: HouseId, input: unknown) {
  return makeAction(
    startRequestSchema,
    (deps, actor, i) =>
      makeStartRequest(deps)(actor, {
        contactId: i.contactId as ContactId,
        itemIds: itemIds(i.itemIds),
      }),
    env(houseId),
  )(input)
}

export async function planVisitAction(houseId: HouseId, input: unknown) {
  return makeAction(
    planVisitSchema,
    (deps, actor, i) =>
      makePlanVisit(deps)(actor, {
        contactId: i.contactId as ContactId,
        itemIds: itemIds(i.itemIds),
        when: i.when as When | undefined,
      }),
    env(houseId),
  )(input)
}

export async function addToRequestAction(houseId: HouseId, input: unknown) {
  return makeAction(
    addToRequestSchema,
    (deps, actor, i) => makeAddToRequest(deps)(actor, { taskId: i.taskId as ItemId }),
    env(houseId),
  )(input)
}

export async function sendRequestAction(houseId: HouseId, input: unknown) {
  return makeAction(
    sendRequestSchema,
    (deps, actor, i) => makeSendRequest(deps)(actor, { runId: i.runId as RunId, via: i.via }),
    env(houseId),
  )(input)
}

export async function handToContactAction(houseId: HouseId, input: unknown) {
  return makeAction(
    handToContactSchema,
    (deps, actor, i) =>
      makeHandToContact(deps)(actor, {
        runId: i.runId as RunId,
        itemIds: itemIds(i.itemIds),
        contactId: i.contactId as ContactId,
        note: i.note,
      }),
    env(houseId),
  )(input)
}

export async function moveToNewVisitAction(houseId: HouseId, input: unknown) {
  return makeAction(
    moveToNewVisitSchema,
    (deps, actor, i) =>
      makeMoveToNewVisit(deps)(actor, {
        fromRunId: i.fromRunId as RunId,
        itemIds: itemIds(i.itemIds),
        when: i.when as When | undefined,
        contactId: i.contactId as ContactId | undefined,
        note: i.note,
      }),
    env(houseId),
  )(input)
}

export async function setVisitDateAction(houseId: HouseId, input: unknown) {
  return makeAction(
    setVisitDateSchema,
    (deps, actor, i) =>
      makeSetVisitDate(deps)(actor, { runId: i.runId as RunId, when: i.when as When | null }),
    env(houseId),
  )(input)
}
