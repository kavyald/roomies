'use client'

import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useItemSheets } from '@/components/items/ItemSheets'
import { useCardContext } from '@/components/items/useCardContext'
import { Button } from '@/components/ui/Button'
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
import type { Room } from '@/lib/domain/house'
import type { HouseId, RoutineId } from '@/lib/domain/ids'
import { choreBoard, holdingLine } from '@/lib/domain/lists'
import { localDateOf } from '@/lib/domain/time'
import { QuickAddSheet } from './QuickAddSheet'
import { RoutineCard } from './RoutineCard'
import { RoutineSheet } from './RoutineSheet'
import { UpkeepSection } from './UpkeepSection'

/**
 * Chores (FRONTEND §5.6): what you have this week, a compact grid of who has what, and Upkeep, the
 * house's own list. Built to fit one phone screen, with no numbers and no "due".
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
  const { openItem, openAdd } = useItemSheets()
  const now = useNow()
  const [openId, setOpenId] = useState<RoutineId | null>(null)
  // Adding from a room keeps its card open underneath: closing goes back to it.
  const [adding, setAdding] = useState<{ room?: Room } | null>(null)

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
  const open = board.cards.find((c) => c.routine.id === openId)
  const nothing =
    board.cards.length === 0 && board.upkeep.felt.length === 0 && board.upkeep.calm.length === 0

  if (nothing && !adding) {
    return (
      <EmptyState
        icon={Sparkles}
        action={
          <Button size="small" onClick={() => openAdd('chore')}>
            Add a chore
          </Button>
        }
      >
        Nothing to do. Enjoy the quiet.
      </EmptyState>
    )
  }

  return (
    <div className="grid gap-3">
      {line && <p className="m-0 text-sm leading-snug font-bold text-ink-soft">{line}</p>}
      {board.cards.length > 0 && (
        <ul aria-label="Who has what" className="m-0 grid list-none grid-cols-2 gap-2.5 p-0">
          {board.cards.map((card) => (
            <li key={card.routine.id}>
              <RoutineCard
                card={card}
                person={ctx.person}
                onOpen={() => setOpenId(card.routine.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <UpkeepSection ctx={ctx} upkeep={board.upkeep} onAdd={() => setAdding({})} />

      {adding ? (
        <QuickAddSheet
          houseId={houseId}
          room={adding.room}
          rooms={rooms.data ?? []}
          onClose={() => setAdding(null)}
        />
      ) : (
        open && (
          <RoutineSheet
            card={open}
            ctx={ctx}
            onClose={() => setOpenId(null)}
            onAdd={(room) => setAdding({ room })}
            onOpenItem={(id, opts) => {
              setOpenId(null)
              openItem(id, opts)
            }}
          />
        )
      )}
    </div>
  )
}
