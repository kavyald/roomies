// Test-only: signs access tokens with local Supabase's well-known development JWT secret, so
// adapter tests can act as any user or role without signing in.

import { createHmac } from 'node:crypto'

const JWT_SECRET =
  process.env.TEST_SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')

/** A signed access token, as Supabase Auth would issue after sign-in. */
export const mintJwt = (claims: Record<string, unknown>): string => {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(
    JSON.stringify({ iat: now, exp: now + 3600, aud: 'authenticated', ...claims }),
  )
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}
