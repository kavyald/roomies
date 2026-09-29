// HouseQueries over the Supabase client (ARCHITECTURE §4). Runs in the browser with the signed-in
// user's session, so RLS decides what comes back. Rows map to domain types with the same mappers
// as the Postgres adapter (timestamps arrive as ISO strings here).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { HouseQueries } from '../../app/ports'
import {
  contactToDomain,
  houseToDomain,
  memberToDomain,
  profileToDomain,
  roomToDomain,
} from '../postgres/mappers'

type Mapper<T> = (row: never) => T

const rows = async <T>(
  q: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  map: Mapper<T>,
): Promise<T[]> => {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => map(r as never))
}

export const supabaseHouseQueries = (sb: SupabaseClient): HouseQueries => ({
  house: async (houseId) => {
    const { data, error } = await sb.from('houses').select('*').eq('id', houseId).maybeSingle()
    if (error) throw new Error(error.message)
    return data ? houseToDomain(data) : undefined
  },
  members: (houseId) =>
    rows(
      sb
        .from('house_members')
        .select('*')
        .eq('house_id', houseId)
        .order('joined_at')
        .order('user_id'),
      memberToDomain,
    ),
  profiles: async (houseId) => {
    const members = await rows(
      sb.from('house_members').select('user_id').eq('house_id', houseId),
      (r: { user_id: string }) => r.user_id,
    )
    if (members.length === 0) return []
    return rows(
      sb.from('profiles').select('*').in('id', members).order('display_name'),
      profileToDomain,
    )
  },
  rooms: (houseId) =>
    rows(
      sb.from('rooms').select('*').eq('house_id', houseId).order('sort_order').order('name'),
      roomToDomain,
    ),
  contacts: (houseId) =>
    rows(sb.from('contacts').select('*').eq('house_id', houseId), contactToDomain).then((cs) =>
      cs.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
    ),
})
