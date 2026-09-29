import { CheckCircle, ShoppingBag, Sparkles, type LucideIcon } from 'lucide-react'
import { describeWhen } from '@/lib/domain/format'
import type { Category, Chore, Item } from '@/lib/domain/items'
import type { Instant } from '@/lib/domain/time'

export const CATEGORY: Record<
  Category,
  { label: string; icon: LucideIcon; blurb: string; article: string }
> = {
  need: { label: 'Need', icon: ShoppingBag, blurb: 'Something to buy', article: 'A need' },
  chore: { label: 'Chore', icon: Sparkles, blurb: 'Ongoing upkeep', article: 'A chore' },
  task: { label: 'Task', icon: CheckCircle, blurb: 'A one-off', article: 'A task' },
}

export const scheduleLabel = (c: Chore): string =>
  c.repeatDays ? `About every ${c.repeatDays === 1 ? 'day' : `${c.repeatDays} days`}` : 'As needed'

/** "Needed by Fri", "Due Oct 3", "Today 10:00" (FRONTEND §3.4). */
export const whenLabel = (item: Item, now: Instant, tz: string): string | undefined => {
  if (!item.when) return undefined
  const d = describeWhen(item.when, now, tz)
  if (item.category === 'need') return `Needed by ${d}`
  if (item.category === 'task')
    return d.startsWith('Today')
      ? "Today's the day" + (item.when.time ? ` · ${item.when.time}` : '')
      : `Due ${d}`
  return d
}
