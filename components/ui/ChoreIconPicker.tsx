'use client'

import { CHORE_ICONS, type ChoreIconName } from '@/lib/domain/icons'
import { CHORE_ICON_COMPONENTS } from './ChoreIcon'
import { cn } from './cn'

/** "spray-can" → "Spray can"; a trailing Lucide number ("trash-2") isn't part of the word. */
export const choreIconLabel = (name: string): string => {
  const words = name.replace(/-\d+$/, '').replace(/-/g, ' ')
  return words[0]!.toUpperCase() + words.slice(1)
}

/**
 * The grid of outline icons a chore or routine picks from (FRONTEND §3.4, T96). Each is a 44pt
 * toggle named for what it shows; the chosen one shows accent. `label` names the group for
 * VoiceOver.
 */
export function ChoreIconPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value?: string
  onChange: (icon: ChoreIconName) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {CHORE_ICONS.map((name) => {
        const Icon = CHORE_ICON_COMPONENTS[name]
        const on = value === name
        return (
          <button
            key={name}
            type="button"
            aria-label={choreIconLabel(name)}
            aria-pressed={on}
            onClick={() => onChange(name)}
            className="grid size-[max(2.75rem,44px)] place-items-center rounded-full"
          >
            <span
              aria-hidden
              className={cn(
                'grid size-[max(2.25rem,36px)] place-items-center rounded-full',
                on ? 'bg-accent text-on-accent' : 'bg-neutral-fill text-neutral-ink',
              )}
            >
              <Icon className="size-[max(1.125rem,18px)]" />
            </span>
          </button>
        )
      })}
    </div>
  )
}
