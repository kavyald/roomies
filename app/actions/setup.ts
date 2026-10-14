'use server'

import { makeSetupHouse, makeStartSetup } from '@/lib/app/setup'
import { authForRequest, depsForJob, depsForRequest } from '@/lib/compose'
import { err, ok, type Result } from '@/lib/domain/result'
import type { SetupError } from '@/lib/domain/setup'
import { emailSchema } from '@/lib/schemas/auth'
import { newHouseSchema } from '@/lib/schemas/setup'
import { requestIp } from '@/lib/server/ip'
import { currentUserId } from '@/lib/server/session'

type Unavailable = 'invalid_token' | 'already_set_up'

/** Step 1: make the owner's account and email them a code. Only while setup is available. */
export async function startSetup(
  token: string,
  rawEmail: unknown,
): Promise<Result<void, Unavailable | 'invalid_email' | 'rate_limited'>> {
  const email = emailSchema.safeParse(rawEmail)
  if (!email.success) return err('invalid_email')
  const deps = { ...depsForJob(), auth: authForRequest() }
  return makeStartSetup(deps)(await requestIp(), token, email.data)
}

/** Step 3, signed in: create the house. Returns its id for the redirect. */
export async function finishSetup(
  token: string,
  raw: unknown,
): Promise<Result<string, Unavailable | SetupError | 'invalid_input' | 'not_signed_in'>> {
  const input = newHouseSchema.safeParse(raw)
  if (!input.success) return err('invalid_input')
  const me = await currentUserId()
  if (!me) return err('not_signed_in')
  const r = await makeSetupHouse(depsForRequest({ actor: { kind: 'user', userId: me } }))(
    await requestIp(),
    me,
    token,
    input.data,
  )
  return r.ok ? ok(r.value.id) : r
}
