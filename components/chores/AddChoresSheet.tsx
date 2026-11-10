'use client'

import { useId, useState } from 'react'
import { inputClass } from '@/components/auth/fields'
import { Sheet } from '@/components/ui/Sheet'
import type { Room } from '@/lib/domain/house'
import type { HouseId, RoomId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
import { AddRoomChores } from './AddRoomChores'

/**
 * Adding Deep clean chores from the Chores tab (T101): pick one of a group's rooms, then its
 * chores, the same way as in Admin → Rooms; adding closes it. Reaches rooms with no chores yet,
 * which have no box.
 */
export function AddChoresSheet({
  houseId,
  title,
  rooms,
  items,
  onClose,
}: {
  houseId: HouseId
  /** What the group is called, for the sheet's description. */
  title: string
  /** Its rooms in house order. */
  rooms: readonly Room[]
  items: readonly Item[]
  onClose: () => void
}) {
  const selectId = useId()
  const [roomId, setRoomId] = useState<RoomId | undefined>(rooms[0]?.id)
  const room = rooms.find((r) => r.id === roomId)
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Add chores" description={title}>
      {rooms.length === 0 ? (
        <p className="m-0 text-sm text-ink-soft">No rooms here yet. Group rooms in Admin.</p>
      ) : (
        <div className="grid gap-3.5">
          <div className="grid gap-1.5">
            <label htmlFor={selectId} className="text-[0.8rem] font-extrabold text-ink-soft">
              Room
            </label>
            <select
              id={selectId}
              className={inputClass}
              value={roomId}
              onChange={(e) => setRoomId(e.target.value as RoomId)}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          {/* A fresh picker per room, so picks never carry over to another room. */}
          {room && (
            <AddRoomChores
              key={room.id}
              houseId={houseId}
              room={room}
              items={items}
              onAdded={onClose}
            />
          )}
        </div>
      )}
    </Sheet>
  )
}
