// Server-side Supabase clients. Only adapters and compose may import Supabase.

import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type CookieJar = {
  getAll(): { name: string; value: string }[]
  /** May throw in a Server Component, where cookies are read-only (the proxy refreshes them). */
  setAll(cookies: { name: string; value: string; options?: object }[]): void
}

/** Acts as whoever the request's session cookie says. Reading it refreshes an expiring session. */
export const sessionClient = (url: string, anonKey: string, jar: CookieJar): SupabaseClient =>
  createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cookies) => {
        try {
          jar.setAll(cookies)
        } catch {
          // Read-only context: fine, the proxy already refreshed the session for this request.
        }
      },
    },
  })

/** Service-role client for Auth admin calls. Never reaches the browser. */
export const adminClient = (url: string, serviceRoleKey: string): SupabaseClient =>
  createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

/** A plain anonymous client (no session), for sending sign-in codes. */
export const anonClient = (url: string, anonKey: string): SupabaseClient =>
  createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
