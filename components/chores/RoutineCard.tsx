'use client'

import { useId } from 'react'
import type { CardContext } from '@/components/items/ItemCard'
import { feelingEmojis } from '@/components/items/Feelings'
import { Avatar } from '@/components/ui/Avatar'
import { ChoreIcon } from '@/components/ui/ChoreIcon'
import { cn } from '@/components/ui/cn'
import { doneLine, type RoutineCard as Card } from '@/lib/domain/lists'

/**
 * One of the Chores tab's cards (FRONTEND §5.6): its icon, name and whoever has it. Only your own
 * shows how it's going, as a row of its chores' icons with no numbers (PRD §6.2 keeps out
 * who's-done-what); any card shows a feeling's emoji. VoiceOver hears "Kitchen and dining, Alex",
 * then "Sink and stove done".
 */
export function RoutineCard({
  card,
  person,
  onOpen,
}: {
  card: Card
  person: CardContext['person']
  onOpen: () => void
}) {
  const id = useId()
  const holder = card.holder ? (person(card.holder) ?? { name: 'Former roommate' }) : undefined
  const allDone = card.chores.length > 0 && card.chores.every((c) => c.done)
  const emojis = feelingEmojis(card.feelings)
  const said = [card.mine ? doneLine(card.chores) : undefined, emojis].filter(Boolean).join('. ')
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={holder ? `${card.routine.name}, ${holder.name}` : card.routine.name}
      aria-describedby={said ? id : undefined}
      className={cn(
        'sticker grid h-full w-full content-between gap-2 rounded-[20px] border-[1.5px] bg-card p-3 text-left',
        card.mine ? 'border-accent bg-top-fill [--sticker-edge:var(--accent)]' : 'border-outline',
      )}
    >
      <span className="flex items-start gap-2">
        <ChoreIcon name={card.routine.icon} className="mt-0.5 size-5 flex-none text-accent-ink" />
        <span className="min-w-0 flex-1 text-[0.95rem] leading-tight font-bold text-balance">
          {card.routine.name}
        </span>
        {holder && <Avatar name={holder.name} element={holder.element} />}
      </span>
      {card.mine && card.chores.length > 0 && (
        <span aria-hidden className="flex flex-wrap items-center gap-1">
          {card.chores.map(({ chore, done }) => (
            <ChoreIcon
              key={chore.id}
              name={chore.icon}
              className={cn('size-4', done ? 'text-accent-ink' : 'text-ink-soft opacity-40')}
            />
          ))}
          {allDone && <span className="text-sm leading-none">✨</span>}
        </span>
      )}
      {emojis && (
        <span aria-hidden className="text-sm leading-none">
          {emojis}
        </span>
      )}
      {said && (
        <span id={id} className="sr-only">
          {said}
        </span>
      )}
    </button>
  )
}
