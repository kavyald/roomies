import type { ReactNode } from 'react'

/** Rows grouped in one rounded box (House tab lists, settings). */
export function ListGroup({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div
      role="list"
      aria-label={label}
      className="sticker overflow-hidden rounded-[20px] border-[1.5px] border-outline [&>*:last-child]:border-b-0"
    >
      {children}
    </div>
  )
}

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
}: {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** A control beside the row (e.g. "Copy number"): kept outside the row's own button. */
  trailing?: ReactNode
  onClick?: () => void
}) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold">{title}</span>
        {subtitle && (
          <span className="mt-px block text-[0.8rem] font-semibold text-ink-soft">{subtitle}</span>
        )}
      </span>
    </>
  )
  return (
    <div
      role="listitem"
      className="flex min-h-11 items-center gap-2 border-b-[1.5px] border-line bg-card pr-2"
    >
      {onClick ? (
        <button
          type="button"
          className="flex min-h-11 flex-1 items-center gap-3 py-3 pl-3.5 text-left"
          onClick={onClick}
        >
          {body}
        </button>
      ) : (
        <div className="flex flex-1 items-center gap-3 py-3 pl-3.5">{body}</div>
      )}
      {trailing}
    </div>
  )
}
