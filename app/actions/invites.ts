'use server'

import {
  makeAcceptInvite,
  makeCreateInvite,
  makeRevokeInvite,
  makeStartInvite,
  type AcceptError,
} from '@/lib/app/invites'
import { authForRequest, depsForJob, depsForRequest } from '@/lib/compose'
import type { HouseId, InviteId, RoomId } from '@/lib/domain/ids'
import type { InviteProblem } from '@/lib/domain/invites'
import { err, type Result } from '@/lib/domain/result'
import { emailSchema } from '@/lib/schemas/auth'
import { inviteIdSchema, joinSchema, newInviteSchema } from '@/lib/schemas/invites'
import { makeAction } from '@/lib/server/action'
import { requestIp } from '@/lib/server/ip'
import { currentActor, currentUserId } from '@/lib/server/session'

const env = (houseId: HouseId) => ({
  currentActor: () => currentActor(houseId),
  deps: (actor: Parameters<typeof depsForRequest>[0]['actor']) => depsForRequest({ actor }),
})

export async function createInviteAction(houseId: HouseId, input: unknown) {
  return makeAction(
    newInviteSchema,
    (deps, actor, i) => makeCreateInvite(deps)(actor, i),
    env(houseId),
  )(input)
}

export async function revokeInviteAction(houseId: HouseId, id: unknown) {
  return makeAction(
    inviteIdSchema,
    (deps, actor, i) => makeRevokeInvite(deps)(actor, i as InviteId),
    env(houseId),
  )(id)
}

/** Joining, step 1: a valid invite gets the person an account and a code. */
export async function startJoin(
  token: string,
  rawEmail: unknown,
): Promise<Result<void, InviteProblem | 'rate_limited' | 'invalid_email'>> {
  const email = emailSchema.safeParse(rawEmail)
  if (!email.success) return err('invalid_email')
  const deps = { ...depsForJob(), auth: authForRequest() }
  const r = await makeStartInvite(deps)(await requestIp(), token, email.data)
  if (!r.ok && r.error !== 'rate_limited') console.warn(`join: invite refused (${r.error})`)
  return r
}

/** Joining, last step (signed in with the code): become a member, with your bedroom. */
export async function acceptJoin(
  token: string,
  raw: unknown,
): Promise<Result<string, AcceptError | 'invalid_input' | 'not_signed_in'>> {
  const input = joinSchema.safeParse(raw)
  if (!input.success) return err('invalid_input')
  const me = await currentUserId()
  if (!me) return err('not_signed_in')
  return makeAcceptInvite(depsForJob())(await requestIp(), me, token, {
    displayName: input.data.displayName,
    ...(input.data.roomId && { roomId: input.data.roomId as RoomId }),
  })
}
