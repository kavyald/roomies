'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'
import { Field } from '@/components/auth/fields'
import { Button } from '@/components/ui/Button'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import { elementClasses } from '@/components/ui/elements'
import { useMoveRoom, useRenameRoom, useRooms } from '@/lib/client/hooks'
import type { Floor, Room } from '@/lib/domain/house'
import type { HouseId } from '@/lib/domain/ids'

const FLOORS: { floor: Floor; label: string }[] = [
  { floor: 'first', label: 'First floor' },
  { floor: 'basement', label: 'Basement' },
  { floor: 'outside', label: 'Outside' },
]

/** Rooms grouped by floor (FRONTEND §5.11). Tap one to rename it or move it. */
export function RoomsSection({ houseId }: { houseId: HouseId }) {
  const rooms = useRooms(houseId)
  const [open, setOpen] = useState<Room | null>(null)
  const live = (rooms.data ?? []).filter((r) => !r.archivedAt)

  return (
    <div className="grid gap-4">
      {FLOORS.map(({ floor, label }) => {
        const here = live.filter((r) => r.floor === floor)
        if (here.length === 0) return null
        return (
          <div key={floor} className="grid gap-2">
            <h3 className="m-0 text-[0.8rem] font-extrabold tracking-[.06em] text-ink-soft uppercase">
              {label}
            </h3>
            <ListGroup label={label}>
              {here.map((r) => (
                <ListRow
                  key={r.id}
                  leading={
                    <span
                      aria-hidden
                      className={cn(
                        'size-3 flex-none rounded-full shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,currentColor_50%,transparent)]',
                        elementClasses(r.element),
                      )}
                    />
                  }
                  title={r.name}
                  onClick={() => setOpen(r)}
                />
              ))}
            </ListGroup>
          </div>
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
        direction === 'up' ? "It's already first on its floor." : "It's already last on its floor.",
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
          <ArrowUp aria-hidden className="size-4" /> Move up
        </Button>
        <Button variant="secondary" disabled={move.isPending} onClick={() => nudge('down')}>
          <ArrowDown aria-hidden className="size-4" /> Move down
        </Button>
      </div>
    </Sheet>
  )
}
