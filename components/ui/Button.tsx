import type { ComponentPropsWithRef } from 'react'
import { cn } from './cn'

type Props = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary'
  size?: 'normal' | 'small'
  block?: boolean
}

/** Pill button. Primary is plum with a darker sticker edge; one primary per screen. */
export function Button({
  variant = 'primary',
  size = 'normal',
  block,
  className,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        'sticker inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-extrabold disabled:cursor-default disabled:opacity-45',
        size === 'small' ? 'px-3.5 py-2 text-sm' : 'px-5 py-3 text-base',
        variant === 'primary'
          ? 'bg-accent text-on-accent [--sticker-edge:color-mix(in_srgb,var(--accent)_60%,#000)]'
          : 'bg-neutral-fill text-neutral-ink',
        block && 'w-full',
        className,
      )}
      {...rest}
    />
  )
}
