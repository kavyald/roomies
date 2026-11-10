'use server'

import { houseEnv } from './env'
import { makeEditContact, makeRemoveContact } from '@/lib/app/contacts'
import {
  makeDeleteAccount,
  makeMoveOut,
  makeMoveRoom,
  makeRenameRoom,
  makeSetFeelingWeights,
  makeChangeMyRoom,
  makeSetRole,
} from '@/lib/app/house'
import { makeCreateRoutine, makeEditRoutine, makeRemoveRoutine } from '@/lib/app/routines'
import type { ContactId, HouseId, RoomId, RoutineId, UserId } from '@/lib/domain/ids'
import type { Version } from '@/lib/domain/items'
import type { RoutineWho } from '@/lib/domain/routines'
import {
  editContactSchema,
  editRoutineSchema,
  feelingWeightsSchema,
  idSchema,
  moveOutSchema,
  moveRoomSchema,
  newRoutineSchema,
  nothingSchema,
  renameRoomSchema,
  setRoleSchema,
  changeMyRoomSchema,
} from '@/lib/schemas/house'
import { makeAction } from '@/lib/server/action'
import { requestSupabase } from '@/lib/server/session'

const routineWho = (
  who: { takesTurns: true; startsWith: string } | { takesTurns: false; fixedMember: string },
): RoutineWho =>
  who.takesTurns
    ? { takesTurns: true, startsWith: who.startsWith as UserId }
    : { takesTurns: false, fixedMember: who.fixedMember as UserId }

export async function editContactAction(houseId: HouseId, input: unknown) {
  return makeAction(
    editContactSchema,
    (deps, actor, i) => makeEditContact(deps)(actor, { id: i.id as ContactId, patch: i.patch }),
    houseEnv(houseId),
  )(input)
}

export async function removeContactAction(houseId: HouseId, id: unknown) {
  return makeAction(
    idSchema,
    (deps, actor, i) => makeRemoveContact(deps)(actor, i as ContactId),
    houseEnv(houseId),
  )(id)
}

export async function moveOutAction(houseId: HouseId, input: unknown) {
  return makeAction(
    moveOutSchema,
    (deps, actor, i) =>
      makeMoveOut(deps)(actor, { userId: i.userId as UserId, ...(i.note && { note: i.note }) }),
    houseEnv(houseId),
  )(input)
}

export async function changeMyRoomAction(houseId: HouseId, input: unknown) {
  return makeAction(
    changeMyRoomSchema,
    (deps, actor, i) => makeChangeMyRoom(deps)(actor, { roomId: i.roomId as RoomId | null }),
    houseEnv(houseId),
  )(input)
}

export async function setRoleAction(houseId: HouseId, input: unknown) {
  return makeAction(
    setRoleSchema,
    (deps, actor, i) => makeSetRole(deps)(actor, { userId: i.userId as UserId, role: i.role }),
    houseEnv(houseId),
  )(input)
}

export async function createRoutineAction(houseId: HouseId, input: unknown) {
  return makeAction(
    newRoutineSchema,
    (deps, actor, i) =>
      makeCreateRoutine(deps)(actor, {
        ...i,
        who: routineWho(i.who),
        roomIds: i.roomIds as RoomId[],
      }),
    houseEnv(houseId),
  )(input)
}

export async function editRoutineAction(houseId: HouseId, input: unknown) {
  return makeAction(
    editRoutineSchema,
    (deps, actor, i) =>
      makeEditRoutine(deps)(actor, {
        id: i.id as RoutineId,
        patch: {
          ...i.patch,
          who: i.patch.who && routineWho(i.patch.who),
          roomIds: i.patch.roomIds as RoomId[] | undefined,
        },
        version: i.version as Version | undefined,
      }),
    houseEnv(houseId),
  )(input)
}

export async function removeRoutineAction(houseId: HouseId, id: unknown) {
  return makeAction(
    idSchema,
    (deps, actor, i) => makeRemoveRoutine(deps)(actor, i as RoutineId),
    houseEnv(houseId),
  )(id)
}

export async function renameRoomAction(houseId: HouseId, input: unknown) {
  return makeAction(
    renameRoomSchema,
    (deps, actor, i) => makeRenameRoom(deps)(actor, { roomId: i.roomId as RoomId, name: i.name }),
    houseEnv(houseId),
  )(input)
}

export async function moveRoomAction(houseId: HouseId, input: unknown) {
  return makeAction(
    moveRoomSchema,
    (deps, actor, i) =>
      makeMoveRoom(deps)(actor, { roomId: i.roomId as RoomId, direction: i.direction }),
    houseEnv(houseId),
  )(input)
}

export async function setFeelingWeightsAction(houseId: HouseId, input: unknown) {
  return makeAction(
    feelingWeightsSchema,
    (deps, actor, i) => makeSetFeelingWeights(deps)(actor, i),
    houseEnv(houseId),
  )(input)
}

/** Deletes the signed-in person's account, then ends their session. */
export async function deleteAccountAction(houseId: HouseId) {
  const r = await makeAction(
    nothingSchema,
    (deps, actor) => makeDeleteAccount(deps)(actor),
    houseEnv(houseId),
  )(undefined)
  if (r.ok) await (await requestSupabase()).auth.signOut()
  return r
}
