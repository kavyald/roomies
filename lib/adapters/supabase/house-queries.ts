// HouseQueries over the Supabase client (ARCHITECTURE §4). Runs in the browser with the signed-in
// user's session, so RLS decides what comes back. Rows map to domain types with the same mappers
// as the Postgres adapter (timestamps arrive as ISO strings here).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { HouseQueries } from '../../app/ports'
import {
  activityToDomain,
  contactToDomain,
  feelingToDomain,
  houseToDomain,
  inviteToDomain,
  itemToDomain,
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

export const supabaseHouseQueries = (sb: SupabaseClient): HouseQueries => {
  // The house time zone, to read item dates as local dates.
  const zones = new Map<string, Promise<string>>()
  const tzOf = (houseId: string) => {
    let z = zones.get(houseId)
    if (!z) {
      z = Promise.resolve(
        sb.from('houses').select('settings').eq('id', houseId).maybeSingle(),
      ).then(({ data }) => (data?.settings as { timezone?: string } | undefined)?.timezone ?? 'UTC')
      zones.set(houseId, z)
    }
    return z
  }
  return {
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
    items: async (houseId) => {
      const tz = await tzOf(houseId)
      return rows(sb.from('items').select('*').eq('house_id', houseId).order('created_at'), (r) =>
        itemToDomain(r, tz),
      )
    },
    feelings: (houseId) =>
      rows(sb.from('feelings').select('*').eq('house_id', houseId), feelingToDomain),
    itemActivity: (houseId, itemId) =>
      rows(
        sb
          .from('activity_events')
          .select('*')
          .eq('house_id', houseId)
          .eq('item_id', itemId)
          .order('id', { ascending: false }),
        activityToDomain,
      ),
    invites: (houseId) =>
      rows(
        sb
          .from('house_invites')
          .select('*')
          .eq('house_id', houseId)
          .order('expires_at', { ascending: false }),
        inviteToDomain,
      ),
    latestActivity: async (houseId, kind) => {
      const [row] = await rows(
        sb
          .from('activity_events')
          .select('*')
          .eq('house_id', houseId)
          .eq('kind', kind)
          .order('id', { ascending: false })
          .limit(1),
        activityToDomain,
      )
      return row
    },
    activity: async (houseId, { before, limit }) => {
      let q = sb.from('activity_events').select('*').eq('house_id', houseId)
      if (before !== undefined) q = q.lt('id', before)
      const page = await rows(q.order('id', { ascending: false }).limit(limit), activityToDomain)
      if (page.length < limit) return { rows: page, before: null }
      // Finish the last action, so a bulk action never spans two pages.
      const last = page.at(-1)!
      const rest = await rows(
        sb
          .from('activity_events')
          .select('*')
          .eq('house_id', houseId)
          .eq('action_id', last.actionId)
          .lt('id', last.id)
          .order('id', { ascending: false }),
        activityToDomain,
      )
      const all = [...page, ...rest]
      return { rows: all, before: all.at(-1)!.id }
    },
  }
}
