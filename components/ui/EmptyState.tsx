import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Text + an icon in a soft circle + at most one button (FRONTEND §5.12). */
export function EmptyState({
  icon: Icon,
  children,
  action,
}: {
  icon: LucideIcon
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="grid justify-items-center gap-2 px-3 py-7 text-center text-ink-soft">
      <span className="grid size-14 place-items-center rounded-full bg-neutral-fill text-neutral-ink">
        <Icon aria-hidden className="size-[26px]" strokeWidth={2} />
      </span>
      <p className="m-0 font-bold">{children}</p>
      {action}
    </div>
  )
}
