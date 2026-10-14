import { Droplet, Flame, Sprout, Wind, type LucideIcon } from 'lucide-react'
import type { Element } from '@/lib/domain/house'

/** Tailwind classes for an element's fill and ink (FRONTEND §3.1). Neutral when there's none. */
export const elementClasses = (element?: Element): string => {
  switch (element) {
    case 'air':
      return 'bg-air-fill text-air-ink'
    case 'fire':
      return 'bg-fire-fill text-fire-ink'
    case 'water':
      return 'bg-water-fill text-water-ink'
    case 'earth':
      return 'bg-earth-fill text-earth-ink'
    default:
      return 'bg-neutral-fill text-neutral-ink'
  }
}

export const elementIcon: Record<Element, LucideIcon> = {
  air: Wind,
  fire: Flame,
  water: Droplet,
  earth: Sprout,
}

export const elementName: Record<Element, string> = {
  air: 'Air',
  fire: 'Fire',
  water: 'Water',
  earth: 'Earth',
}
