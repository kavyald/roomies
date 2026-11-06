'use client'

import { X } from 'lucide-react'
import { RoomChip } from '@/components/ui/Chip'
import type { Room } from '@/lib/domain/house'
import type { RoomId } from '@/lib/domain/ids'
import { RoomSelect } from './RoomSelect'

/**
 * A chore's rooms (one "Vacuum" can cover the kitchen and dining, PRD §6.2): each chosen room is a
 * chip to tap away, and RoomSelect adds another.
 */
export function RoomsSelect({
  id,
  rooms,
  value,
  onChange,
}: {
  id: string
  rooms: readonly Room[]
  value: readonly RoomId[]
  onChange: (v: RoomId[]) => void
}) {
  const chosen = rooms.filter((r) => value.includes(r.id)).sort((a, b) => a.sortOrder - b.sortOrder)
  return (
    <div className="grid gap-1.5">
      {chosen.length > 0 && (
        <ul aria-label="Chosen rooms" className="m-0 flex list-none flex-wrap gap-x-1.5 p-0">
          {chosen.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                aria-label={`Remove ${r.name}`}
                onClick={() => onChange(value.filter((x) => x !== r.id))}
                className="flex min-h-11 items-center"
              >
                <RoomChip name={r.name} element={r.element} />
                <X aria-hidden className="ml-0.5 size-4 text-ink-soft" strokeWidth={2.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <RoomSelect
        id={id}
        rooms={rooms.filter((r) => !value.includes(r.id))}
        value=""
        empty={chosen.length > 0 ? 'Add another room' : 'No room'}
        onChange={(r) => {
          if (r) onChange([...value, r])
        }}
      />
    </div>
  )
}
