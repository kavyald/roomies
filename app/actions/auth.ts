'use server'

import { makeForgetPushSubscription } from '@/lib/app/push'
import { authForRequest, depsForRequest, logUnexpected } from '@/lib/compose'
import { err, ok, type Result } from '@/lib/domain/result'
import { codeSchema, emailSchema } from '@/lib/schemas/auth'
import { pushEndpointSchema } from '@/lib/schemas/push'
import { currentUserId, requestSupabase } from '@/lib/server/session'

/**
 * Sends a sign-in code if the email has an account. The answer is the same either way, so the
 * page can't be used to find out who lives here (ARCHITECTURE §5.2 step 6).
 */
export async function requestCode(rawEmail: unknown): Promise<Result<void, 'invalid_email'>> {
  const email = emailSchema.safeParse(rawEmail)
  if (!email.success) return err('invalid_email')
  try {
    await authForRequest().sendCode(email.data)
  } catch (e) {
    console.error(e)
  }
  return ok(undefined)
}

/** Checks the 6-digit code and, if it's right, sets the session cookie. */
export async function verifyCode(
  rawEmail: unknown,
  rawCode: unknown,
): Promise<Result<void, 'wrong_code'>> {
  const email = emailSchema.safeParse(rawEmail)
  const code = codeSchema.safeParse(rawCode)
  if (!email.success || !code.success) return err('wrong_code')
  const sb = await requestSupabase()
  const { error } = await sb.auth.verifyOtp({ email: email.data, token: code.data, type: 'email' })
  return error ? err('wrong_code') : ok(undefined)
}

/**
 * Signs out. `input.endpoint` is this browser's push endpoint, if it had one: it stops getting
 * your notifications (T84), so the next person on a shared phone doesn't see them. Answers rather
 * than redirecting, so the browser unsubscribes only once this went through.
 */
export async function signOut(input?: unknown): Promise<Result<void, 'unexpected'>> {
  const push = pushEndpointSchema.safeParse(input)
  const userId = push.success ? await currentUserId() : null
  if (push.success && userId) {
    const actor = { kind: 'user', userId } as const
    try {
      await makeForgetPushSubscription(depsForRequest({ actor }))(actor, push.data.endpoint)
    } catch (e) {
      logUnexpected('action')(e)
    }
  }
  const sb = await requestSupabase()
  const { error } = await sb.auth.signOut()
  if (error) {
    logUnexpected('action')(error)
    return err('unexpected')
  }
  return ok(undefined)
}
