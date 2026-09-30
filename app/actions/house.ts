'use server'

import { makeEditContact, makeRemoveContact } from '@/lib/app/contacts'
import {
  makeDeleteAccount,
  makeMoveOut,
  makeMoveRoom,
  makeRenameRoom,
  makeSetFeelingWeights,
  makeSetRole,
} from '@/lib/app/house'
import { depsForRequest } from '@/lib/compose'
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
import { currentActor, requestSupabase } from '@/lib/server/session'

const env = (houseId: HouseId) => ({
  currentActor: () => currentActor(houseId),
  deps: (actor: Parameters<typeof depsForRequest>[0]['actor']) => depsForRequest({ actor }),
})

export async function editContactAction(houseId: HouseId, input: unknown) {
  return makeAction(
    editContactSchema,
    (deps, actor, i) => makeEditContact(deps)(actor, { id: i.id as ContactId, patch: i.patch }),
    env(houseId),
  )(input)
}

export async function removeContactAction(houseId: HouseId, id: unknown) {
  return makeAction(
    idSchema,
    (deps, actor, i) => makeRemoveContact(deps)(actor, i as ContactId),
    env(houseId),
  )(id)
}

export async function moveOutAction(houseId: HouseId, input: unknown) {
  return makeAction(
    moveOutSchema,
    (deps, actor, i) =>
      makeMoveOut(deps)(actor, { userId: i.userId as UserId, ...(i.note && { note: i.note }) }),
    env(houseId),
  )(input)
}

export async function setRoleAction(houseId: HouseId, input: unknown) {
  return makeAction(
    setRoleSchema,
    (deps, actor, i) => makeSetRole(deps)(actor, { userId: i.userId as UserId, role: i.role }),
    env(houseId),
  )(input)
}

export async function renameRoomAction(houseId: HouseId, input: unknown) {
  return makeAction(
    renameRoomSchema,
    (deps, actor, i) => makeRenameRoom(deps)(actor, { roomId: i.roomId as RoomId, name: i.name }),
    env(houseId),
  )(input)
}

export async function moveRoomAction(houseId: HouseId, input: unknown) {
  return makeAction(
    moveRoomSchema,
    (deps, actor, i) =>
      makeMoveRoom(deps)(actor, { roomId: i.roomId as RoomId, direction: i.direction }),
    env(houseId),
  )(input)
}

export async function setFeelingWeightsAction(houseId: HouseId, input: unknown) {
  return makeAction(
    feelingWeightsSchema,
    (deps, actor, i) => makeSetFeelingWeights(deps)(actor, i),
    env(houseId),
  )(input)
}

/** Deletes the signed-in person's account, then ends their session. */
export async function deleteAccountAction(houseId: HouseId) {
  const r = await makeAction(
    nothingSchema,
    (deps, actor) => makeDeleteAccount(deps)(actor),
    env(houseId),
  )(undefined)
  if (r.ok) await (await requestSupabase()).auth.signOut()
  return r
}
