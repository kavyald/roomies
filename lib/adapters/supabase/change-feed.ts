// ChangeFeed over Supabase Realtime (T26): activity inserts for one house, as the signed-in user.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChangeFeed } from '../../app/ports'
import type { UserId } from '../../domain/ids'
import { changeForKind } from '../change-for-kind'

let channels = 0

export const supabaseChangeFeed = (sb: SupabaseClient): ChangeFeed => ({
  subscribe: (houseId, onChange) => {
    const channel = sb
      .channel(`house:${houseId}:${++channels}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_events',
          filter: `house_id=eq.${houseId}`,
        },
        (payload) => {
          const row = payload.new as { kind?: unknown; actor_id?: string | null }
          onChange(changeForKind(String(row.kind), (row.actor_id ?? null) as UserId | null))
        },
      )
      .subscribe()
    return () => void sb.removeChannel(channel)
  },
})
