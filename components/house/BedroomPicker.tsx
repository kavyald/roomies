'use client'

import { Check } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/components/ui/cn'
import { elementClasses } from '@/components/ui/elements'
import type { Element } from '@/lib/domain/house'

export type BedroomOption = {
  /** What the picker hands back: a room id, or an element before the rooms exist (setup). */
  readonly key: string
  readonly name: string
  readonly element?: Element
  /** Who lives there; a taken room can't be picked. */
  readonly takenBy?: string
}

/**
 * "Which room is yours?" (PRD §10, T93): the four bedrooms in their element colors, taken ones
 * showing whose they are, and "None of these". The same picker at setup, joining and in Roommates.
 */
export function BedroomPicker({
  options,
  value,
  onChange,
  noneLabel = 'None of these',
}: {
  options: readonly BedroomOption[]
  value: string | null
  onChange: (key: string | null) => void
  noneLabel?: string
}) {
  return (
    <div role="radiogroup" aria-label="Your room" className="grid gap-2">
      {options.map((b) => {
        const chosen = value === b.key
        return (
          <button
            key={b.key}
            type="button"
            role="radio"
            aria-checked={chosen}
            disabled={!!b.takenBy}
            onClick={() => onChange(b.key)}
            className={cn(
              'flex min-h-14 items-center gap-3 rounded-2xl bg-paper px-3.5 py-3 text-left font-bold shadow-[inset_0_0_0_1.5px_var(--line)] disabled:opacity-60',
              chosen && 'shadow-[inset_0_0_0_2px_var(--accent)]',
            )}
          >
            <span
              className={cn(
                'grid size-8 place-items-center rounded-full',
                elementClasses(b.element),
              )}
            >
              {chosen ? <Check aria-hidden className="size-4" /> : null}
            </span>
            <span className="flex-1">{b.name}</span>
            {b.takenBy && (
              <span className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
                <Avatar name={b.takenBy} element={b.element} size={20} />
                {b.takenBy}&apos;s
              </span>
            )}
          </button>
        )
      })}
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        onClick={() => onChange(null)}
        className={cn(
          'min-h-11 rounded-2xl px-3.5 py-2 text-left font-bold text-ink-soft',
          value === null && 'bg-neutral-fill text-neutral-ink',
        )}
      >
        {noneLabel}
      </button>
    </div>
  )
}
