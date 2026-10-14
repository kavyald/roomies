// The AuthGateway contract: accounts are created only on purpose, and codes go only to accounts
// that exist. Run against the memory fake (unit) and Supabase Auth + Mailpit (db).

import { beforeAll, describe, expect, it } from 'vitest'
import type { AuthGateway } from '../../app/ports'

export type AuthGatewayHarness = {
  readonly auth: AuthGateway
  /** How many sign-in codes this address has received. */
  codesSentTo(email: string): Promise<number>
  /** A never-used address. */
  freshEmail(): string
}

export const authGatewayContract = (name: string, makeHarness: () => Promise<AuthGatewayHarness>) =>
  describe(`AuthGateway contract: ${name}`, () => {
    let h: AuthGatewayHarness
    beforeAll(async () => {
      h = await makeHarness()
    })

    it('creates an account once', async () => {
      const email = h.freshEmail()
      const first = await h.auth.createUser(email)
      expect(first.ok).toBe(true)
      expect(await h.auth.createUser(email.toUpperCase())).toEqual({
        ok: false,
        error: 'already_exists',
      })
    })

    it('sends a code to an existing account', async () => {
      const email = h.freshEmail()
      await h.auth.createUser(email)
      await h.auth.sendCode(email)
      await expect.poll(() => h.codesSentTo(email), { timeout: 5000 }).toBe(1)
    })

    it('quietly sends nothing to an unknown email, and creates no account', async () => {
      const email = h.freshEmail()
      await expect(h.auth.sendCode(email)).resolves.toBeUndefined()
      await new Promise((r) => setTimeout(r, 300))
      expect(await h.codesSentTo(email)).toBe(0)
      // Still unknown: creating it now works, so sendCode didn't create it.
      expect((await h.auth.createUser(email)).ok).toBe(true)
    })

    it('deletes an account, after which it gets no codes', async () => {
      const email = h.freshEmail()
      const r = await h.auth.createUser(email)
      if (!r.ok) throw new Error(r.error)
      await h.auth.deleteUser(r.value)
      await h.auth.sendCode(email)
      await new Promise((res) => setTimeout(res, 300))
      expect(await h.codesSentTo(email)).toBe(0)
    })
  })
