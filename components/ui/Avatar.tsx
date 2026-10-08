import type { Element } from '@/lib/domain/house'
import { cn } from './cn'
import { elementClasses, elementIcon, elementName } from './elements'

const SIZES = {
  20: 'size-5 text-[8px]',
  32: 'size-8 text-[13px]',
  48: 'size-12 text-[19px]',
  64: 'size-16 text-[26px]',
} as const

export const initials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters =
    words.length > 1 ? [words[0]![0], words.at(-1)![0]] : [...(words[0] ?? '?')].slice(0, 2)
  return letters.join('').toUpperCase()
}

/**
 * A person: a circle with their initials in their bedroom's element color, plus a tiny element
 * badge. Your color is your room (FRONTEND §4.2). Never shows feelings.
 */
export function Avatar({
  name,
  element,
  size = 32,
}: {
  name: string
  element?: Element
  size?: keyof typeof SIZES
}) {
  const Icon = element ? elementIcon[element] : undefined
  const label = element ? `${name}, ${elementName[element]} room` : name
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        'relative inline-grid flex-none place-items-center rounded-full font-extrabold shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,currentColor_45%,transparent)]',
        SIZES[size],
        elementClasses(element),
      )}
    >
      <span aria-hidden>{initials(name)}</span>
      {Icon && size >= 32 && (
        <span
          aria-hidden
          className="absolute -right-[3px] -bottom-[3px] grid size-[42%] place-items-center rounded-full bg-card shadow-[0_0_0_1.5px_var(--line)]"
        >
          <Icon className="size-[70%]" strokeWidth={2.5} />
        </span>
      )}
    </span>
  )
}
