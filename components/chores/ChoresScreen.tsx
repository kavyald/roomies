'use client'

import { Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useItemSheets } from '@/components/items/ItemSheets'
import { useCardContext } from '@/components/items/useCardContext'
import { Avatar } from '@/components/ui/Avatar'
import { ChoreIcon } from '@/components/ui/ChoreIcon'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  useFeelings,
  useHouse,
  useItems,
  useMembers,
  useRooms,
  useRoutines,
} from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import { useNow } from '@/lib/client/use-now'
import type { HouseId, RoomId, RoutineId } from '@/lib/domain/ids'
import { choreBoard, holdingLine } from '@/lib/domain/lists'
import { localDateOf } from '@/lib/domain/time'
import { AddChoresSheet } from './AddChoresSheet'
import { QuickAddSheet } from './QuickAddSheet'
import { RoomBox } from './RoomBox'
import { RoomSheet } from './RoomSheet'
import { UpkeepSection } from './UpkeepSection'

/**
 * Chores (FRONTEND §5.6, T101): what you have this week, then each routine with a box per room
 * that has chores (yours first, ticked right there), then Upkeep, the house's own list. Built to
 * fit one phone screen, with no numbers and no "due". A room's chores are set up in Admin → Rooms.
 */
export function ChoresScreen({ houseId }: { houseId: HouseId }) {
  const { me } = useAppClient()
  const items = useItems(houseId)
  const routines = useRoutines(houseId)
  const rooms = useRooms(houseId)
  const members = useMembers(houseId)
  const house = useHouse(houseId)
  const feelings = useFeelings(houseId)
  const ctx = useCardContext(houseId)
  const { openItem } = useItemSheets()
  const now = useNow()
  const [openRoom, setOpenRoom] = useState<RoomId | null>(null)
  const [adding, setAdding] = useState(false)
  // Deep clean chores for one of a routine's rooms, from its heading's + Add.
  const [addingTo, setAddingTo] = useState<RoutineId | null>(null)

  if (items.isError || routines.isError) {
    return (
      <p role="alert" className="font-bold text-ink-soft">
        Couldn&apos;t reach the house. Check your connection and try again.
      </p>
    )
  }
  if (items.isPending || routines.isPending || rooms.isPending) {
    return <p className="text-ink-soft">Loading…</p>
  }

  const tz = house.data?.settings.timezone ?? 'UTC'
  const today = localDateOf(now, tz)
  const board = choreBoard(items.data, {
    rooms: rooms.data ?? [],
    routines: routines.data,
    members: members.data ?? [],
    feelings: feelings.data ?? [],
    me,
    today,
    tz,
  })
  const line = holdingLine(board.cards, today)
  const open = board.cards
    .flatMap((card) => card.rooms.map((box) => ({ card, box })))
    .find(({ box }) => box.room.id === openRoom)
  const addTo = board.cards.find((c) => c.routine.id === addingTo)
  // With routines, the tab shows them even before they have chores, so + Add is there.
  const nothing =
    board.cards.length === 0 && board.upkeep.felt.length === 0 && board.upkeep.calm.length === 0

  if (nothing && !adding) {
    return (
      <EmptyState
        icon={Sparkles}
        action={
          <Link
            href={`/h/${houseId}/admin`}
            className="sticker inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-3.5 py-2 text-sm font-extrabold text-on-accent [--sticker-edge:color-mix(in_srgb,var(--accent)_60%,#000)]"
          >
            Set up rooms
          </Link>
        }
      >
        Nothing to do yet. Give each room its chores in Admin → Rooms.
      </EmptyState>
    )
  }

  return (
    <div className="grid gap-3">
      {line && <p className="m-0 text-sm leading-snug font-bold text-ink-soft">{line}</p>}
      {board.cards.map((card) => {
        const holder = card.holder
          ? (ctx.person(card.holder) ?? { name: 'Former roommate' })
          : undefined
        const boxes = card.rooms.filter((r) => r.chores.length > 0)
        return (
          // A group, not a landmark: a routine can share its name with one of its rooms.
          <div
            role="group"
            key={card.routine.id}
            aria-label={holder ? `${card.routine.name}, ${holder.name}` : card.routine.name}
            className="grid gap-1.5"
          >
            <div className="flex items-center gap-1.5">
              <h2 className="m-0 flex min-w-0 flex-1 items-center gap-1.5 text-[0.8rem] font-extrabold tracking-[.06em] text-ink-soft uppercase">
                <ChoreIcon name={card.routine.icon} className="size-4 flex-none text-accent-ink" />
                <span className="min-w-0 flex-1 truncate">{card.routine.name}</span>
                {holder && <Avatar name={holder.name} element={holder.element} size={20} />}
              </h2>
              <button
                type="button"
                aria-label={`Add chores: ${card.routine.name}`}
                onClick={() => setAddingTo(card.routine.id)}
                className="min-h-11 flex-none px-1 text-sm font-extrabold text-accent-ink"
              >
                + Add
              </button>
            </div>
            {boxes.length === 0 ? (
              <p className="m-0 text-sm text-ink-soft">No chores here yet.</p>
            ) : (
              <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
                {boxes.map((box) => (
                  <li key={box.room.id} className={card.mine ? 'col-span-2' : undefined}>
                    <RoomBox
                      box={box}
                      mine={card.mine}
                      {...(holder && { holderName: holder.name })}
                      ctx={ctx}
                      onOpen={() => setOpenRoom(box.room.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      <UpkeepSection ctx={ctx} upkeep={board.upkeep} onAdd={() => setAdding(true)} />

      {adding ? (
        <QuickAddSheet
          houseId={houseId}
          rooms={rooms.data ?? []}
          onClose={() => setAdding(false)}
        />
      ) : addTo ? (
        <AddChoresSheet
          houseId={houseId}
          title={addTo.routine.name}
          rooms={addTo.rooms.map((r) => r.room)}
          items={items.data}
          onClose={() => setAddingTo(null)}
        />
      ) : (
        open && (
          <RoomSheet
            box={open.box}
            card={open.card}
            ctx={ctx}
            onClose={() => setOpenRoom(null)}
            onOpenItem={(id, opts) => {
              setOpenRoom(null)
              openItem(id, opts)
            }}
          />
        )
      )}
    </div>
  )
}
