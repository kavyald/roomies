'use client'

import { Check, ChevronRight, Circle } from 'lucide-react'
import { useId } from 'react'
import { feelingEmojis } from '@/components/items/Feelings'
import type { CardContext } from '@/components/items/ItemCard'
import { cn } from '@/components/ui/cn'
import { choresLine, doneLine, type RoomBox as Box } from '@/lib/domain/lists'
import { useTick } from './RoomSheet'

/**
 * A room on the Chores tab (FRONTEND §5.6, T101). Your own rooms list their Deep clean chores as
 * one-tap ticks (an empty circle, then a check in accent, T112), ✨ when all are; the room's name
 * opens its sheet. A housemate's room says its chores in words, never which are done (PRD §6.2),
 * and a feeling's emoji; the whole box opens the room (T105). VoiceOver hears "Kitchen, Alex".
 */
export function RoomBox({
  box,
  mine,
  holderName,
  ctx,
  onOpen,
}: {
  box: Box
  mine: boolean
  holderName?: string
  ctx: CardContext
  onOpen: () => void
}) {
  const id = useId()
  const tick = useTick(ctx)
  const emojis = feelingEmojis(box.feelings)
  const name = holderName ? `${box.room.name}, ${holderName}` : box.room.name
  const allDone = box.chores.every((c) => c.done)

  if (!mine) {
    // Full width like your own, the name on its own line and the chores in words under it (T105).
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={name}
        aria-describedby={emojis ? `${id}-chores ${id}-feel` : `${id}-chores`}
        className="sticker grid min-h-11 w-full gap-0.5 rounded-[16px] border-[1.5px] border-outline bg-card px-2.5 py-2 text-left"
      >
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 text-[0.95rem] leading-tight font-bold">
            {box.room.name}
            {emojis && <span id={`${id}-feel`}> {emojis}</span>}
          </span>
          <ChevronRight aria-hidden className="size-4 flex-none text-ink-soft" />
        </span>
        <span
          id={`${id}-chores`}
          className="line-clamp-2 text-[0.85rem] leading-snug text-ink-soft"
        >
          {choresLine(box.chores)}
        </span>
      </button>
    )
  }

  const said = [doneLine(box.chores), emojis].filter(Boolean).join('. ')
  return (
    <section
      aria-label={name}
      className="sticker grid gap-0.5 rounded-[16px] border-[1.5px] border-accent bg-top-fill px-2.5 pt-1 pb-1.5 [--sticker-edge:var(--accent)]"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${box.room.name} details`}
        aria-describedby={said ? id : undefined}
        className="flex min-h-8 items-center gap-1.5 text-left"
      >
        <span className="min-w-0 flex-1 text-[0.95rem] leading-tight font-bold">
          {box.room.name}
          {allDone && <span aria-hidden> ✨</span>}
          {emojis && <span aria-hidden> {emojis}</span>}
        </span>
        <ChevronRight aria-hidden className="size-4 flex-none text-ink-soft" />
      </button>
      {said && (
        <span id={id} className="sr-only">
          {said}
        </span>
      )}
      <ul
        aria-label={`${box.room.name} chores`}
        className="m-0 flex list-none flex-wrap gap-x-1.5 p-0"
      >
        {box.chores.map(({ chore, done }) => (
          <li key={chore.id}>
            <button
              type="button"
              aria-label={`Did it: ${chore.title}`}
              aria-pressed={done}
              onClick={() => void tick(chore, done)}
              className="flex min-h-11 items-center"
            >
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3 pl-2 text-[0.85rem] font-bold',
                  done
                    ? 'bg-accent text-on-accent'
                    : 'bg-card text-ink shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--ink)_25%,transparent)]',
                )}
              >
                {done ? (
                  <Check aria-hidden className="size-4" strokeWidth={2.5} />
                ) : (
                  // A tick to tap, not a tag (T112): an empty circle until it's done.
                  <Circle aria-hidden className="size-4 text-ink-soft" strokeWidth={2.5} />
                )}
                {chore.title}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
