import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { cn } from './cn'

export type Tab = { href: string; label: string; icon: LucideIcon }

/** The bottom tab bar. Sits above the iPhone home indicator via the safe-area inset. */
export function TabBar({
  tabs,
  current,
  inline,
}: {
  tabs: readonly Tab[]
  current: string
  /** Render in place instead of fixed to the bottom (the /dev/kit preview). */
  inline?: boolean
}) {
  return (
    <nav
      aria-label="Tabs"
      className={cn(
        inline ? 'relative' : 'fixed inset-x-0 bottom-0 z-30',
        'border-t-[1.5px] border-line bg-[color-mix(in_srgb,var(--paper)_92%,transparent)] px-1.5 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur-[10px]',
      )}
    >
      <ul className="mx-auto grid max-w-[430px] grid-cols-5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === current
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'grid min-h-11 justify-items-center gap-[3px] py-1 text-[0.66rem] font-bold',
                  active ? 'text-accent-ink' : 'text-ink-soft',
                )}
              >
                <Icon aria-hidden className="size-6" strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
