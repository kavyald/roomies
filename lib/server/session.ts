// Who is making this request, from the Supabase session cookie (ARCHITECTURE §5).

import { cookies } from 'next/headers'
import { sessionClient } from '../adapters/supabase/server'
import { publicConfig } from '../config'
import type { HouseActor } from '../domain/actor'
import { asId, type HouseId, type UserId } from '../domain/ids'

/** The Supabase client bound to this request's cookies. */
export const requestSupabase = async () => {
  const jar = await cookies()
  const { supabaseUrl, supabaseAnonKey } = publicConfig()
  return sessionClient(supabaseUrl, supabaseAnonKey, {
    getAll: () => jar.getAll(),
    setAll: (list) => list.forEach(({ name, value, options }) => jar.set(name, value, options)),
  })
}

/** The signed-in user, verified with Supabase Auth (not just decoded from the cookie). */
export const currentUserId = async (): Promise<UserId | null> => {
  const sb = await requestSupabase()
  const { data } = await sb.auth.getUser()
  return data.user ? asId<'user'>(data.user.id) : null
}

/** The signed-in user acting in `houseId`. Membership itself is enforced by RLS. */
export const currentActor = async (houseId: HouseId): Promise<HouseActor | null> => {
  const userId = await currentUserId()
  return userId ? { kind: 'member', userId, houseId } : null
}
