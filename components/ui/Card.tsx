import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

const base =
  'sticker grid w-full gap-2 rounded-[20px] border-[1.5px] border-outline bg-card px-3.5 pt-3.5 pb-3 text-left'

type Props = HTMLAttributes<HTMLElement> & { children: ReactNode; onClick?: () => void }

/** A soft card with the sticker edge. Becomes a button when it's tappable. */
export function Card({ className, onClick, children, ...rest }: Props) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, className)} {...rest}>
        {children}
      </button>
    )
  }
  return (
    <div className={cn(base, className)} {...rest}>
      {children}
    </div>
  )
}
