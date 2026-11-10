import { Check } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { SplitwiseMark } from './SplitwiseMark'

/**
 * A cost's Splitwise icon (T89): a 44pt target around the mark, like `IconButton`. Once someone in
 * the house has sent the cost to Splitwise it's highlighted (a green circle and a check), and it
 * stays tappable to send it again. `amount` is "$42.50", for its name.
 */
export function SplitwiseButton({
  amount,
  sent,
  onClick,
}: {
  amount: string
  sent: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={sent ? `Added to Splitwise. Add ${amount} again` : `Add ${amount} to Splitwise`}
      className="group grid size-[max(2.75rem,44px)] flex-none place-items-center rounded-full"
      onClick={onClick}
    >
      <span
        className={cn(
          'relative grid size-[max(2.25rem,36px)] place-items-center rounded-full transition-transform group-active:scale-[.96]',
          sent && 'bg-splitwise-fill ring-[1.5px] ring-splitwise',
        )}
      >
        <SplitwiseMark />
        {sent && (
          <span
            aria-hidden
            className="absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-splitwise text-white ring-2 ring-card"
          >
            <Check className="size-2.5" strokeWidth={3.5} />
          </span>
        )}
      </span>
    </button>
  )
}
