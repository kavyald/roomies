import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { cn } from './cn'

export type Tab = {
  href: string
  label: string
  icon: LucideIcon
  /** Something on this tab is Urgent: a dot on its icon, and its name says so (T108). */
  urgent?: boolean
}

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
      <ul className="mx-auto grid max-w-[430px] auto-cols-fr grid-flow-col">
        {tabs.map(({ href, label, icon: Icon, urgent }) => {
          const active = href === current
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                // One name, not label + an sr-only span: that read as "Tasks , something urgent".
                aria-label={urgent ? `${label}, something urgent` : undefined}
                className={cn(
                  'grid min-h-11 justify-items-center gap-[3px] py-1 text-[0.66rem] font-bold',
                  active ? 'text-accent-ink' : 'text-ink-soft',
                )}
              >
                <span className="relative">
                  <Icon aria-hidden className="size-6" strokeWidth={active ? 2.5 : 2} />
                  {urgent && (
                    <span
                      aria-hidden
                      className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-accent shadow-[0_0_0_2px_var(--paper)]"
                    />
                  )}
                </span>
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
