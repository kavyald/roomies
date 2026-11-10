'use client'

import { ArrowDown, ArrowUp, ChevronRight, DoorOpen, Pencil, X } from 'lucide-react'
import { useId, useState } from 'react'
import { Field } from '@/components/auth/fields'
import { AddRoomChores, pickHeadingClass } from '@/components/chores/AddRoomChores'
import { Button } from '@/components/ui/Button'
import { ChoreIcon } from '@/components/ui/ChoreIcon'
import { IconButton, IconMark } from '@/components/ui/IconButton'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import {
  useArchiveItem,
  useItems,
  useMoveRoom,
  useRenameRoom,
  useRestoreItem,
  useRooms,
  useRoutines,
} from '@/lib/client/hooks'
import type { Room } from '@/lib/domain/house'
import type { HouseId, RoomId } from '@/lib/domain/ids'
import type { Chore } from '@/lib/domain/items'
import { ROOM_GROUPS, roomGroup, roomsInGroup } from '@/lib/domain/rooms'
import { ROOM_GROUP_LABEL, roomKindLabel } from './room-labels'

/**
 * Admin → Rooms (FRONTEND §5.11): one row that opens a sheet of the rooms by group. Tap one for
 * its own sheet: rename it, move it within its group, and set up its Deep clean chores (T101).
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
          subtitle={
            count
              ? `${count} rooms · rename, reorder or set up chores`
              : 'Rename, reorder or set up chores'
          }
          onClick={() => setOpen(true)}
        />
      </ListGroup>
      {open && <RoomsSheet houseId={houseId} onClose={() => setOpen(false)} />}
    </>
  )
}

function RoomsSheet({ houseId, onClose }: { houseId: HouseId; onClose: () => void }) {
  const rooms = useRooms(houseId)
  const items = useItems(houseId)
  const [openId, setOpenId] = useState<RoomId | null>(null)
  const all = rooms.data ?? []
  const open = all.find((r) => r.id === openId)
  const choresIn = (id: RoomId) =>
    (items.data ?? []).filter(
      (i) =>
        i.category === 'chore' && !i.archivedAt && i.kind === 'deep_clean' && i.rooms.includes(id),
    ).length

  // One room's sheet in place of the list; closing it comes back here (T101).
  if (open) return <RoomSheet houseId={houseId} room={open} onClose={() => setOpenId(null)} />

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Rooms"
      description="Tap a room to rename it, move it, or set up its chores."
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
              {here.map((r) => {
                const n = choresIn(r.id)
                return (
                  <li key={r.id} className="border-b-[1.5px] border-line bg-card last:border-b-0">
                    <button
                      type="button"
                      aria-label={`${r.name}, ${roomKindLabel(r.kind)}`}
                      aria-description={n ? undefined : 'No chores yet'}
                      onClick={() => setOpenId(r.id)}
                      className="flex min-h-[max(2.75rem,44px)] w-full items-center gap-2 py-1.5 pr-2 pl-3.5 text-left font-bold"
                    >
                      <span className="min-w-0 flex-1">{r.name}</span>
                      {n === 0 && (
                        <span aria-hidden className="text-sm font-semibold text-ink-soft">
                          No chores yet
                        </span>
                      )}
                      <IconMark icon={ChevronRight} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </Sheet>
  )
}

/**
 * One room (T101): its name and place, the Deep clean chores whoever has it looks after, and
 * one-tap picks from every chore name in the house to add more. Each room gets its own copy.
 */
function RoomSheet({
  houseId,
  room,
  onClose,
}: {
  houseId: HouseId
  room: Room
  onClose: () => void
}) {
  const items = useItems(houseId)
  const routines = useRoutines(houseId)
  const archive = useArchiveItem(houseId)
  const restore = useRestoreItem(houseId)
  const toast = useToast()
  const headingId = useId()
  const [renaming, setRenaming] = useState(false)

  const all = items.data ?? []
  const here = all
    .filter(
      (i): i is Chore =>
        i.category === 'chore' &&
        !i.archivedAt &&
        i.kind === 'deep_clean' &&
        i.rooms.includes(room.id),
    )
    .sort((a, b) => a.title.localeCompare(b.title))
  const routine = routines.data?.find((r) => r.id === room.routineId && !r.removedAt)

  const removeChore = async (chore: Chore) => {
    const r = await archive.mutateAsync(chore.id)
    if (!r.ok) return toast("Couldn't remove it. Try again.")
    toast('Removed.', { label: 'Undo', onClick: () => restore.mutate(chore.id) })
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={room.name}
      description={roomKindLabel(room.kind)}
    >
      <div className="grid gap-4">
        {renaming ? (
          <div className="overflow-hidden rounded-2xl border-[1.5px] border-outline">
            <RoomEditor houseId={houseId} room={room} onDone={() => setRenaming(false)} />
          </div>
        ) : (
          <Button
            variant="secondary"
            size="small"
            className="justify-self-start"
            onClick={() => setRenaming(true)}
          >
            <Pencil aria-hidden className="size-4" /> Rename or move
          </Button>
        )}

        <section aria-labelledby={headingId} className="grid gap-1.5">
          <h3 id={headingId} className={pickHeadingClass}>
            Deep clean
          </h3>
          <p className="m-0 text-sm text-ink-soft">
            {routine
              ? `Whoever has ${routine.name} looks after these.`
              : 'This room isn’t in a routine yet, so these show in Upkeep.'}
          </p>
          {here.length === 0 ? (
            <p className="m-0 text-sm font-bold text-ink-soft">No chores here yet.</p>
          ) : (
            <ul
              aria-label={`${room.name} chores`}
              className="m-0 grid list-none overflow-hidden rounded-2xl border-[1.5px] border-outline p-0"
            >
              {here.map((c) => (
                <li
                  key={c.id}
                  className="flex min-h-[max(2.75rem,44px)] items-center gap-2.5 border-b-[1.5px] border-line bg-card py-1 pr-1 pl-3.5 last:border-b-0"
                >
                  <ChoreIcon
                    name={c.icon}
                    className="size-[max(1.125rem,18px)] flex-none text-ink-soft"
                  />
                  <span className="min-w-0 flex-1 font-bold">{c.title}</span>
                  <IconButton
                    icon={X}
                    label={`Remove ${c.title}`}
                    disabled={archive.isPending}
                    onClick={() => void removeChore(c)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <AddRoomChores houseId={houseId} room={room} items={all} />
      </div>
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
