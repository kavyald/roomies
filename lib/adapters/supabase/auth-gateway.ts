// AuthGateway over Supabase Auth (ARCHITECTURE §5.2). Public sign-up is off, so accounts are
// created only here (the invite flow), and codes go only to existing accounts.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthGateway } from '../../app/ports'
import { asId } from '../../domain/ids'
import { err, ok } from '../../domain/result'

export const supabaseAuthGateway = (
  admin: SupabaseClient,
  anon: SupabaseClient,
  log: (msg: string) => void = console.warn,
): AuthGateway => ({
  createUser: async (email) => {
    const { data, error } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      email_confirm: true,
    })
    if (error) {
      if (error.code === 'email_exists' || /already/i.test(error.message))
        return err('already_exists')
      throw new Error(`createUser failed: ${error.message}`)
    }
    return ok(asId<'user'>(data.user.id))
  },

  sendCode: async (email) => {
    const { error } = await anon.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    })
    // Unknown emails fail with "Signups not allowed"; that's expected and never shown.
    if (error && error.code !== 'otp_disabled')
      log(`sendCode: ${error.code ?? ''} ${error.message}`)
  },

  deleteUser: async (id) => {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) throw new Error(`deleteUser failed: ${error.message}`)
  },
})
