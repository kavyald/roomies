import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { mintJwt } from '../../testing/jwt'
import { adminClient, sessionClient } from './server'

// Local Supabase only (TESTING.md §4).
const API_URL = process.env.TEST_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const admin = adminClient(API_URL, mintJwt({ role: 'service_role', aud: undefined }))
const email = `t-${randomUUID().slice(0, 8)}@roomies.test`
let userId: string | undefined

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId)
})

describe('sessionClient cookies', () => {
  it('writes the session as SameSite=Lax cookies on / (ARCHITECTURE §5.4)', async () => {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true })
    userId = created.data.user?.id
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const tokenHash = link.data.properties?.hashed_token
    expect(tokenHash).toBeTruthy()

    const written: { name: string; options?: { sameSite?: unknown; path?: unknown } }[] = []
    const sb = sessionClient(API_URL, mintJwt({ role: 'anon', aud: undefined }), {
      getAll: () => [],
      setAll: (cookies) => written.push(...cookies),
    })
    const { error } = await sb.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash! })
    expect(error).toBeNull()

    const auth = written.filter((c) => c.name.startsWith('sb-'))
    expect(auth.length).toBeGreaterThan(0)
    for (const c of auth) expect(c.options).toMatchObject({ sameSite: 'lax', path: '/' })
  })
})
