'use client'

import { ArrowDown, ArrowUp, DoorOpen, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Field } from '@/components/auth/fields'
import { Button } from '@/components/ui/Button'
import { IconMark } from '@/components/ui/IconButton'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useMoveRoom, useRenameRoom, useRooms } from '@/lib/client/hooks'
import type { Room } from '@/lib/domain/house'
import type { HouseId, RoomId } from '@/lib/domain/ids'
import { ROOM_GROUPS, roomGroup, roomsInGroup } from '@/lib/domain/rooms'
import { ROOM_GROUP_LABEL, roomKindLabel } from './room-labels'

/**
 * House → Rooms (FRONTEND §5.11): one row that opens a sheet of the rooms by group, as plain
 * names. Tap a name to rename it or move it within its group, in place.
 */
export function RoomsSection({ houseId }: { houseId: HouseId }) {
  const rooms = useRooms(houseId)
  const [open, setOpen] = useState(false)
  const count = rooms.data?.length ?? 0
  return (
    <>
      <ListGroup label="Rooms">
        <ListRow
          leading={<DoorOpen aria-hidden className="size-5 text-ink-soft" />}
          title="Rooms"
          subtitle={count ? `${count} rooms · rename or reorder` : 'Rename or reorder'}
          onClick={() => setOpen(true)}
        />
      </ListGroup>
      {open && <RoomsSheet houseId={houseId} onClose={() => setOpen(false)} />}
    </>
  )
}

function RoomsSheet({ houseId, onClose }: { houseId: HouseId; onClose: () => void }) {
  const rooms = useRooms(houseId)
  const [editing, setEditing] = useState<RoomId | null>(null)
  const all = rooms.data ?? []

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Rooms"
      description="Tap a room to rename it or move it within its group."
    >
      {ROOM_GROUPS.map((group) => {
        const here = roomsInGroup(all, group)
        if (here.length === 0) return null
        const label = ROOM_GROUP_LABEL[group]
        return (
          <section key={group} className="grid gap-1.5">
            <h3 className="m-0 text-[0.8rem] font-extrabold tracking-[.06em] text-ink-soft uppercase">
              {label}
            </h3>
            <ul
              aria-label={label}
              className="m-0 grid list-none overflow-hidden rounded-2xl border-[1.5px] border-outline p-0"
            >
              {here.map((r) => (
                <li key={r.id} className="border-b-[1.5px] border-line bg-card last:border-b-0">
                  {editing === r.id ? (
                    <RoomEditor houseId={houseId} room={r} onDone={() => setEditing(null)} />
                  ) : (
                    <button
                      type="button"
                      aria-label={`${r.name}, ${roomKindLabel(r.kind)}`}
                      onClick={() => setEditing(r.id)}
                      className="flex min-h-[max(2.75rem,44px)] w-full items-center gap-2 py-1.5 pr-2 pl-3.5 text-left font-bold"
                    >
                      <span className="min-w-0 flex-1">{r.name}</span>
                      <IconMark icon={Pencil} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </Sheet>
  )
}

function RoomEditor({
  houseId,
  room,
  onDone,
}: {
  houseId: HouseId
  room: Room
  onDone: () => void
}) {
  const rename = useRenameRoom(houseId)
  const move = useMoveRoom(houseId)
  const toast = useToast()
  const [name, setName] = useState(room.name)
  const group = ROOM_GROUP_LABEL[roomGroup(room.kind)].toLowerCase()

  const save = async () => {
    if (name.trim() === room.name) return onDone()
    const r = await rename.mutateAsync({ roomId: room.id, name })
    if (!r.ok)
      return toast(
        r.error === 'empty_name' ? 'Give the room a name.' : "Couldn't rename it. Try again.",
      )
    toast('Renamed.')
    onDone()
  }
  const nudge = async (direction: 'up' | 'down') => {
    const r = await move.mutateAsync({ roomId: room.id, direction })
    if (!r.ok && r.error === 'at_edge')
      toast(
        direction === 'up' ? `It's already first in ${group}.` : `It's already last in ${group}.`,
      )
  }

  return (
    <div
      role="group"
      aria-label={`Edit ${room.name}, ${roomKindLabel(room.kind)}`}
      className="grid gap-2 bg-paper p-3.5"
    >
      <Field
        id="room-name"
        label="Name"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={rename.isPending} onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={rename.isPending} onClick={save}>
          Save
        </Button>
        <Button variant="secondary" disabled={move.isPending} onClick={() => nudge('up')}>
          <ArrowUp aria-hidden className="size-4" /> Move earlier
        </Button>
        <Button variant="secondary" disabled={move.isPending} onClick={() => nudge('down')}>
          <ArrowDown aria-hidden className="size-4" /> Move later
        </Button>
      </div>
    </div>
  )
}
