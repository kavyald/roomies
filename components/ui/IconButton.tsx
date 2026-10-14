import { LoaderCircle, type LucideIcon } from 'lucide-react'
import type { ComponentPropsWithRef } from 'react'
import { cn } from './cn'

type Props = Omit<ComponentPropsWithRef<'button'>, 'children' | 'aria-label'> & {
  icon: LucideIcon
  /** The accessible name: what the button does ("Save", "More actions"). Required, no text shows. */
  label: string
  /** Accent for the one action that commits (a sheet's check); neutral for the rest. */
  tone?: 'accent' | 'neutral'
  /** Working: a spinner replaces the icon and the button is disabled. */
  busy?: boolean
}

/**
 * The icon-only round button (FRONTEND §3.4, §9): a 44pt target around a 32px filled circle with a
 * 16px icon at stroke 2.5. Sizes have px floors, since rem follows the system body size (13px in
 * Playwright WebKit). Focus shows the app-wide ring (globals.css) around the 44pt target. The
 * sheet's save check, the "…" menu trigger and other header buttons use it; follow it for new
 * icon-only buttons.
 */
export function IconButton({
  icon: Icon,
  label,
  tone = 'neutral',
  busy = false,
  disabled,
  className,
  type = 'button',
  ...rest
}: Props) {
  const Shown = busy ? LoaderCircle : Icon
  return (
    <button
      type={type}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={cn(
        'group grid size-[max(2.75rem,44px)] flex-none place-items-center rounded-full disabled:cursor-default',
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          'grid size-[max(2rem,32px)] place-items-center rounded-full transition-transform group-active:scale-[.96] group-disabled:opacity-45 group-disabled:group-active:scale-100',
          tone === 'accent' ? 'bg-accent text-on-accent' : 'bg-neutral-fill text-neutral-ink',
        )}
      >
        <Shown
          aria-hidden
          className={cn('size-[max(1rem,16px)]', busy && 'animate-spin motion-reduce:animate-none')}
          strokeWidth={2.5}
        />
      </span>
    </button>
  )
}
