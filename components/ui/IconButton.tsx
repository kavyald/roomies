import { LoaderCircle, type LucideIcon } from 'lucide-react'
import type { ComponentPropsWithRef } from 'react'
import { cn } from './cn'

type Props = Omit<ComponentPropsWithRef<'button'>, 'children' | 'aria-label'> & {
  icon: LucideIcon
  /** The accessible name: what the button does ("Save", "Edit", "Select all"). Required, no text shows. */
  label: string
  /** Accent for the one action that commits (a sheet's check); neutral for the rest. */
  tone?: 'accent' | 'neutral'
  /** Working: a spinner replaces the icon and the button is disabled. */
  busy?: boolean
}

const circle = (tone: 'accent' | 'neutral') =>
  cn(
    'grid size-[max(2rem,32px)] flex-none place-items-center rounded-full',
    tone === 'accent' ? 'bg-accent text-on-accent' : 'bg-neutral-fill text-neutral-ink',
  )

/**
 * The same 32px circle and icon, but not a control: a hint inside a row that is itself the button
 * (a room or contact row shows the edit Pencil, T68). Hidden from VoiceOver; the row names itself.
 */
export function IconMark({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span aria-hidden className={circle('neutral')}>
      <Icon className="size-[max(1rem,16px)]" strokeWidth={2.5} />
    </span>
  )
}

/**
 * The icon-only round button (FRONTEND §3.4, §9): a 44pt target around a 32px filled circle with a
 * 16px icon at stroke 2.5. Sizes have px floors, since rem follows the system body size (13px in
 * Playwright WebKit). Focus shows the app-wide ring (globals.css) around the 44pt target. The
 * sheet's save check, Edit (Pencil) and Delete (Trash2), Select all and other icon-only buttons
 * use it (T68); follow it for new ones. A toggle passes `aria-pressed` and shows accent while on.
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
          circle(tone),
          'transition-transform group-active:scale-[.96] group-disabled:opacity-45 group-disabled:group-active:scale-100',
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
