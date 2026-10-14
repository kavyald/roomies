'use client'

import type { Room } from '@/lib/domain/house'
import type { RoomId } from '@/lib/domain/ids'
import { ROOM_GROUPS, roomsInGroup } from '@/lib/domain/rooms'
import { inputClass } from '@/components/auth/fields'
import { ROOM_GROUP_LABEL } from '@/components/house/room-labels'

/**
 * Picks a room, in the same three groups as House → Rooms: Bedrooms, Bathrooms, Spaces
 * (FRONTEND §9 RoomPicker). A native select: great on iPhone.
 */
export function RoomSelect({
  id,
  rooms,
  value,
  onChange,
}: {
  id: string
  rooms: readonly Room[]
  value: RoomId | ''
  onChange: (v: RoomId | '') => void
}) {
  return (
    <select
      id={id}
      className={inputClass}
      value={value}
      onChange={(e) => onChange(e.target.value as RoomId | '')}
    >
      <option value="">No room</option>
      {ROOM_GROUPS.map((group) => {
        const here = roomsInGroup(rooms, group)
        return here.length ? (
          <optgroup key={group} label={ROOM_GROUP_LABEL[group]}>
            {here.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </optgroup>
        ) : null
      })}
    </select>
  )
}
