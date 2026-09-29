'use server'

import { redirect } from 'next/navigation'
import { authForRequest } from '@/lib/compose'
import { err, ok, type Result } from '@/lib/domain/result'
import { codeSchema, emailSchema } from '@/lib/schemas/auth'
import { requestSupabase } from '@/lib/server/session'

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

export async function signOut(): Promise<void> {
  const sb = await requestSupabase()
  await sb.auth.signOut()
  redirect('/sign-in')
}
