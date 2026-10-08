'use server'

import { houseEnv } from './env'
import { makeEditContact, makeRemoveContact } from '@/lib/app/contacts'
import {
  makeDeleteAccount,
  makeMoveOut,
  makeMoveRoom,
  makeRenameRoom,
  makeSetFeelingWeights,
  makeSetRole,
} from '@/lib/app/house'
import type { ContactId, HouseId, RoomId, UserId } from '@/lib/domain/ids'
import {
  editContactSchema,
  feelingWeightsSchema,
  idSchema,
  moveOutSchema,
  moveRoomSchema,
  nothingSchema,
  renameRoomSchema,
  setRoleSchema,
} from '@/lib/schemas/house'
import { makeAction } from '@/lib/server/action'
import { requestSupabase } from '@/lib/server/session'

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

export async function setRoleAction(houseId: HouseId, input: unknown) {
  return makeAction(
    setRoleSchema,
    (deps, actor, i) => makeSetRole(deps)(actor, { userId: i.userId as UserId, role: i.role }),
    houseEnv(houseId),
  )(input)
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
