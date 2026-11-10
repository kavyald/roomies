'use client'

import { Check } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { FeelingButton, FeelingTray, feelingEmojis } from '@/components/items/Feelings'
import type { CardContext } from '@/components/items/ItemCard'
import { choreRoomsLabel } from '@/components/items/meta'
import { useDidIt } from '@/components/items/useDidIt'
import { Avatar } from '@/components/ui/Avatar'
import { ChoreIcon } from '@/components/ui/ChoreIcon'
import { cn } from '@/components/ui/cn'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useFeelingsByItem, useItems } from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import type { ItemId } from '@/lib/domain/ids'
import type { Chore } from '@/lib/domain/items'
import type { RoomBox, RoutineCard as Card } from '@/lib/domain/lists'
import { AddRoomChores } from './AddRoomChores'

/**
 * Ticking a Deep clean chore, or tapping a ticked one to undo it (T96). Undo belongs to whoever
 * did it (lib/domain/items), so a housemate's tick only says so.
 */
export const useTick = (ctx: CardContext) => {
  const { me } = useAppClient()
  const { didIt, undoIt } = useDidIt(ctx.houseId)
  const toast = useToast()
  return async (chore: Chore, done: boolean) => {
    if (!done) return didIt(chore.id)
    if (chore.lastDone?.by !== me) return toast('A housemate got this one. Only they can undo it.')
    if (await undoIt(chore.id, chore.lastDone.at.epochMs)) toast('Back on the list.')
  }
}

/** One Deep clean chore: its icon and name open it; 🙂+ and the tick sit beside, never inside. */
function ChoreRow({
  ctx,
  chore,
  done,
  onOpen,
}: {
  ctx: CardContext
  chore: Chore
  done: boolean
  onOpen: (id: ItemId, opts?: { note?: boolean }) => void
}) {
  const tick = useTick(ctx)
  const feelings = useFeelingsByItem(ctx.houseId).get(chore.id) ?? []
  const [tray, setTray] = useState(false)
  const feelButton = useRef<HTMLButtonElement>(null)
  const id = useId()
  const closeTray = () => {
    setTray(false)
    feelButton.current?.focus({ preventScroll: true })
  }
  const roomsLabel = chore.rooms.length > 1 ? choreRoomsLabel(chore, ctx.rooms) : ''
  const emojis = feelingEmojis(feelings)

  return (
    <li className="grid gap-1">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => onOpen(chore.id)}
          aria-labelledby={`${id}-title`}
          aria-describedby={roomsLabel || emojis ? `${id}-more` : undefined}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <ChoreIcon
            name={chore.icon}
            className={cn('size-5 flex-none', done ? 'text-accent-ink' : 'text-ink-soft')}
          />
          <span className="min-w-0 leading-tight">
            <span id={`${id}-title`} className="font-bold">
              {chore.title}
            </span>
            {(roomsLabel || emojis) && (
              <span id={`${id}-more`} className="text-[0.8rem] font-semibold text-ink-soft">
                {roomsLabel && ` · ${roomsLabel}`}
                {emojis && ` ${emojis}`}
              </span>
            )}
          </span>
        </button>
        <FeelingButton
          ref={feelButton}
          title={chore.title}
          open={tray}
          controls={`${id}-tray`}
          onClick={() => (tray ? closeTray() : setTray(true))}
        />
        <button
          type="button"
          aria-label={`Did it: ${chore.title}`}
          aria-pressed={done}
          onClick={() => void tick(chore, done)}
          className="grid size-11 flex-none place-items-center rounded-full"
        >
          <span
            className={cn(
              'grid size-9 place-items-center rounded-full',
              done
                ? 'bg-accent text-on-accent'
                : 'bg-card text-transparent shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--ink)_30%,transparent)]',
            )}
          >
            <Check aria-hidden className="size-5" strokeWidth={2.5} />
          </span>
        </button>
      </div>
      {tray && (
        <FeelingTray
          id={`${id}-tray`}
          houseId={ctx.houseId}
          itemId={chore.id}
          onDone={closeTray}
          onAddNote={() => onOpen(chore.id, { note: true })}
        />
      )}
    </li>
  )
}

/**
 * One room's sheet (FRONTEND §5.6, T101): whoever has it → whoever's next in the header, then its
 * Deep clean chores, each one tap to tick, with 🙂+ and the chore's details. Anyone may tick, so
 * the ticks show to anyone here. Below them, more chores to add (the header check adds them).
 */
export function RoomSheet({
  box,
  card,
  ctx,
  onClose,
  onOpenItem,
}: {
  box: RoomBox
  card: Card
  ctx: CardContext
  onClose: () => void
  onOpenItem: (id: ItemId, opts?: { note?: boolean }) => void
}) {
  const items = useItems(ctx.houseId)
  const who = (id: string) => ctx.person(id) ?? { name: 'Former roommate' }
  const holder = card.holder ? who(card.holder) : undefined
  const next = card.next && card.next !== card.holder ? who(card.next) : undefined
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={box.room.name}
      description={`Deep clean · ${card.routine.name}`}
      actions={
        holder && (
          <span className="flex flex-none items-center gap-1.5 pt-0.5">
            <Avatar name={holder.name} element={holder.element} />
            {next && (
              <>
                <span className="sr-only">then</span>
                <span aria-hidden className="font-bold text-ink-soft">
                  →
                </span>
                <Avatar name={next.name} element={next.element} />
              </>
            )}
          </span>
        )
      }
    >
      <ul aria-label={`${box.room.name} chores`} className="m-0 grid list-none gap-0.5 p-0">
        {box.chores.map(({ chore, done }) => (
          <ChoreRow key={chore.id} ctx={ctx} chore={chore} done={done} onOpen={onOpenItem} />
        ))}
      </ul>
      <AddRoomChores houseId={ctx.houseId} room={box.room} items={items.data ?? []} />
    </Sheet>
  )
}
