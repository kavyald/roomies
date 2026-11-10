import { Split } from 'lucide-react'
import { cn } from '@/components/ui/cn'

/**
 * The Splitwise app mark (T89). A stand-in until Splitwise's own icon can be used: no published
 * brand rules were found (2026-11-10), so it's a neutral split glyph on Splitwise green. Swap the
 * official asset in here and every cost row, the toast and Admin follow.
 */
export function SplitwiseMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-[max(1.5rem,24px)] flex-none place-items-center rounded-[7px] bg-splitwise text-white',
        className,
      )}
    >
      <Split className="size-[max(0.875rem,14px)]" strokeWidth={2.75} />
    </span>
  )
}
