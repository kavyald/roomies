'use client'

import type { Floor, Room } from '@/lib/domain/house'
import type { RoomId } from '@/lib/domain/ids'
import { inputClass } from '@/components/auth/fields'

const FLOORS: [Floor, string][] = [
  ['first', 'First floor'],
  ['basement', 'Basement'],
  ['outside', 'Outside'],
]

/** Picks a room, grouped by floor (FRONTEND §9 RoomPicker). A native select: great on iPhone. */
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
  const live = rooms.filter((r) => !r.archivedAt)
  return (
    <select
      id={id}
      className={inputClass}
      value={value}
      onChange={(e) => onChange(e.target.value as RoomId | '')}
    >
      <option value="">No room</option>
      {FLOORS.map(([floor, label]) => {
        const here = live.filter((r) => r.floor === floor)
        return here.length ? (
          <optgroup key={floor} label={label}>
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
