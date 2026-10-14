'use client'

import { ChevronDown } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cn } from './cn'

/** Tap-to-open sections stacked in one rounded box (item detail, FRONTEND §5.4). */
export function DisclosureGroup({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[20px] border-[1.5px] border-outline [&>*:last-child]:border-b-0">
      {children}
    </div>
  )
}

/**
 * One tap-to-open section: a row with its title and a short summary ("Costs · $42"), and the
 * content below it once opened. The section is a named region; the row is a button named by the
 * title, described by the summary, that says whether it's open ("Costs, collapsed, $42.00").
 */
export function Disclosure({
  title,
  label,
  summary,
  defaultOpen = false,
  children,
}: {
  title: ReactNode
  /** The region's name, when the title isn't plain text or should read differently. */
  label?: string
  /** Beside the title: a count, a total, a tier. */
  summary?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  const hasSummary = summary != null && summary !== ''
  return (
    <section
      aria-label={label ?? (typeof title === 'string' ? title : undefined)}
      className="border-b-[1.5px] border-line bg-card"
    >
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          aria-labelledby={`${id}-title`}
          aria-describedby={hasSummary ? `${id}-summary` : undefined}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full items-center gap-2 py-3 pr-3 pl-3.5 text-left"
        >
          <span id={`${id}-title`} className="min-w-0 flex-1 text-base font-bold">
            {title}
          </span>
          {hasSummary && (
            <span
              id={`${id}-summary`}
              className="flex-none text-sm font-semibold text-ink-soft tabular-nums"
            >
              {summary}
            </span>
          )}
          <ChevronDown
            aria-hidden
            className={cn(
              'size-4 flex-none text-ink-soft motion-safe:transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </h3>
      <div id={`${id}-panel`} hidden={!open} className="grid gap-2 px-3.5 pb-3.5">
        {open && children}
      </div>
    </section>
  )
}
