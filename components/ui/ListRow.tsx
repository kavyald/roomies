import type { ReactNode } from 'react'
import { cn } from './cn'

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
      {trailing}
    </>
  )
  const cls = cn(
    'flex min-h-11 w-full items-center gap-3 border-b-[1.5px] border-line bg-card px-3.5 py-3 text-left',
  )
  return (
    <div role="listitem">
      {onClick ? (
        <button type="button" className={cls} onClick={onClick}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </div>
  )
}
