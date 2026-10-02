import { CheckCircle, ShoppingBag, Sparkles, type LucideIcon } from 'lucide-react'
import { describeWhen } from '@/lib/domain/format'
import type { Category, Chore, Item } from '@/lib/domain/items'
import { daysAgo, daysSinceDone, isChoreDue } from '@/lib/domain/lists'
import type { Instant } from '@/lib/domain/time'

export const CATEGORY: Record<
  Category,
  { label: string; icon: LucideIcon; blurb: string; article: string }
> = {
  need: { label: 'Need', icon: ShoppingBag, blurb: 'Something to buy', article: 'A need' },
  chore: { label: 'Chore', icon: Sparkles, blurb: 'Ongoing upkeep', article: 'A chore' },
  task: { label: 'Task', icon: CheckCircle, blurb: 'A one-off', article: 'A task' },
}

/** The word for finishing each kind of item: the check button, the swipe, the detail sheet. */
export const FINISH: Record<Category, string> = { need: 'Got it', chore: 'Did it', task: 'Done' }

export const scheduleLabel = (c: Chore): string =>
  c.repeatDays ? `About every ${c.repeatDays === 1 ? 'day' : `${c.repeatDays} days`}` : 'As needed'

/** "Needed by Fri", "Due Oct 3", "Today 10:00" (FRONTEND §3.4). */
export const whenLabel = (item: Item, now: Instant, tz: string): string | undefined => {
  if (!item.when) return undefined
  const when = describeWhen(item.when, now, tz)
  // Mid-sentence, "Tomorrow" and "Yesterday" read lowercase ("Due yesterday").
  const d = /^(Tomorrow|Yesterday)/.test(when) ? when[0]!.toLowerCase() + when.slice(1) : when
  if (item.category === 'need') return `Needed by ${d}`
  if (item.category === 'task')
    return d.startsWith('Today')
      ? "Today's the day" + (item.when.time ? ` · ${item.when.time}` : '')
      : `Due ${d}`
  return d
}

/** "Last done 9 days ago · Wren", describing the chore's state, never a person's (FRONTEND §7). */
export const choreMeta = (
  c: Chore,
  now: Instant,
  tz: string,
  name: (id: string) => string | undefined,
): string => {
  const days = daysSinceDone(c, now, tz)
  if (days === null) return 'Not done yet'
  const base = `Last done ${daysAgo(days)} · ${name(c.lastDone!.by) ?? 'Former roommate'}`
  return isChoreDue(c, now, tz) && c.repeatDays && days - c.repeatDays >= 2
    ? `${base} · This one's been waiting a bit`
    : base
}

/** The card's meta line for any item. */
export const itemMeta = (
  item: Item,
  now: Instant,
  tz: string,
  name: (id: string) => string | undefined,
): string | undefined =>
  item.category === 'chore' ? choreMeta(item, now, tz, name) : whenLabel(item, now, tz)
