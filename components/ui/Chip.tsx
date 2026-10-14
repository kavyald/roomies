import type { LucideIcon } from 'lucide-react'
import type { Element } from '@/lib/domain/house'
import type { Tier } from '@/lib/domain/priority'
import { cn } from './cn'
import { elementClasses, elementIcon } from './elements'

const base =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-[3px] pr-2.5 pl-2 text-[0.78rem] font-bold'

/** A neutral chip with an icon: item types, "Handled by", "On X's run" (FRONTEND §3.4). */
export function Chip({ icon: Icon, children }: { icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <span className={cn(base, 'bg-neutral-fill text-neutral-ink')}>
      {Icon && <Icon aria-hidden className="size-3.5" strokeWidth={2} />}
      {children}
    </span>
  )
}

/** A room chip: the room's element color and icon, or neutral for shared rooms. */
export function RoomChip({ name, element }: { name: string; element?: Element }) {
  const Icon = element ? elementIcon[element] : undefined
  return (
    <span className={cn(base, elementClasses(element))}>
      {Icon && <Icon aria-hidden className="size-3.5" strokeWidth={2} />}
      {name}
    </span>
  )
}

/** Priority tier. Always carries the word; color is never the only signal (FRONTEND §3.1). */
export function TierChip({ tier }: { tier: Tier }) {
  const tierBase = 'rounded-full px-2.5 py-[3px] text-xs font-extrabold tracking-[.01em]'
  switch (tier) {
    case 'top':
      return (
        <span className={cn(tierBase, 'bg-top-fill text-top-ink')}>
          <span aria-hidden>●● </span>Top
        </span>
      )
    case 'high':
      return (
        <span
          className={cn(
            tierBase,
            'bg-card text-accent-ink shadow-[inset_0_0_0_1.5px_var(--accent)]',
          )}
        >
          High
        </span>
      )
    case 'normal':
      return <span className={cn(tierBase, 'bg-neutral-fill text-neutral-ink')}>Normal</span>
    case 'low':
      return <span className="text-xs font-extrabold text-ink-soft">Low</span>
  }
}
