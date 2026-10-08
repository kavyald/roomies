'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Field } from '@/components/auth/fields'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import { elementClasses } from '@/components/ui/elements'
import { useMoveRoom, useRenameRoom, useRooms } from '@/lib/client/hooks'
import type { Room } from '@/lib/domain/house'
import type { HouseId } from '@/lib/domain/ids'
import { ROOM_GROUPS, roomGroup, roomsInGroup } from '@/lib/domain/rooms'
import { ROOM_GROUP_LABEL, RoomIcon, roomKindLabel } from './room-labels'

/**
 * Rooms as small squares, grouped by what they are (FRONTEND §5.11): Bedrooms in their element's
 * colors, then Bathrooms, then Spaces. Tap one to rename it or move it within its group.
 */
export function RoomsSection({ houseId }: { houseId: HouseId }) {
  const rooms = useRooms(houseId)
  const [open, setOpen] = useState<Room | null>(null)
  const all = rooms.data ?? []

  return (
    <div className="grid gap-3">
      {ROOM_GROUPS.map((group) => {
        const here = roomsInGroup(all, group)
        if (here.length === 0) return null
        const label = ROOM_GROUP_LABEL[group]
        return (
          <section key={group} className="grid gap-1.5">
            <h3 className="m-0 text-[0.8rem] font-extrabold tracking-[.06em] text-ink-soft uppercase">
              {label}
            </h3>
            <ul aria-label={label} className="m-0 grid list-none grid-cols-4 gap-2 p-0">
              {here.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-label={`${r.name}, ${roomKindLabel(r.kind)}`}
                    onClick={() => setOpen(r)}
                    className={cn(
                      'sticker flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] border-outline p-1 text-center',
                      r.element ? elementClasses(r.element) : 'bg-card text-ink',
                    )}
                  >
                    <RoomIcon room={r} className="size-5 flex-none" />
                    <span className="line-clamp-2 text-[0.75rem] leading-tight font-bold break-words hyphens-auto">
                      {r.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {open && <RoomSheet houseId={houseId} room={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function RoomSheet({
  houseId,
  room,
  onClose,
}: {
  houseId: HouseId
  room: Room
  onClose: () => void
}) {
  const rename = useRenameRoom(houseId)
  const move = useMoveRoom(houseId)
  const toast = useToast()
  const [name, setName] = useState(room.name)
  const group = ROOM_GROUP_LABEL[roomGroup(room.kind)].toLowerCase()

  const save = async () => {
    if (name.trim() === room.name) return onClose()
    const r = await rename.mutateAsync({ roomId: room.id, name })
    if (!r.ok)
      return toast(
        r.error === 'empty_name' ? 'Give the room a name.' : "Couldn't rename it. Try again.",
      )
    toast('Renamed.')
    onClose()
  }
  const nudge = async (direction: 'up' | 'down') => {
    const r = await move.mutateAsync({ roomId: room.id, direction })
    if (!r.ok && r.error === 'at_edge')
      toast(
        direction === 'up' ? `It's already first in ${group}.` : `It's already last in ${group}.`,
      )
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={room.name}>
      <Field id="room-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <Button block disabled={rename.isPending} onClick={save}>
        Save
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={move.isPending} onClick={() => nudge('up')}>
          <ArrowLeft aria-hidden className="size-4" /> Move earlier
        </Button>
        <Button variant="secondary" disabled={move.isPending} onClick={() => nudge('down')}>
          Move later <ArrowRight aria-hidden className="size-4" />
        </Button>
      </div>
    </Sheet>
  )
}
