import { randomUUID } from 'node:crypto'
import { authGatewayContract } from '../contracts/auth-gateway.contract'
import { supabaseAuthGateway } from './auth-gateway'
import { adminClient, anonClient } from './server'
import { mintJwt } from '../../testing/jwt'

// Local Supabase only. Codes land in Mailpit (TESTING.md §4).
const API_URL = process.env.TEST_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const MAILPIT_URL = process.env.TEST_MAILPIT_URL ?? 'http://127.0.0.1:54324'

authGatewayContract('supabase auth + mailpit', async () => ({
  auth: supabaseAuthGateway(
    adminClient(API_URL, mintJwt({ role: 'service_role', aud: undefined })),
    anonClient(API_URL, mintJwt({ role: 'anon', aud: undefined })),
    () => {},
  ),
  codesSentTo: async (email) => {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    )
    return ((await res.json()) as { messages_count: number }).messages_count
  },
  freshEmail: () => `t-${randomUUID().slice(0, 8)}@roomies.test`,
}))
