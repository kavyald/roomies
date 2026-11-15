import { CheckCircle, House, ShoppingBag, Sparkles } from 'lucide-react'
import type { Tab } from '@/components/ui/TabBar'
import type { Category } from '@/lib/domain/items'

/**
 * House · Needs · Tasks · Chores (FRONTEND §5, T107). House is the house's own page. A tab whose
 * kind is in `urgent` carries a dot (T108).
 */
export const houseTabs = (base: string, urgent: ReadonlySet<Category> = new Set()): Tab[] => [
  { href: base, label: 'House', icon: House },
  { href: `${base}/needs`, label: 'Needs', icon: ShoppingBag, urgent: urgent.has('need') },
  { href: `${base}/tasks`, label: 'Tasks', icon: CheckCircle, urgent: urgent.has('task') },
  { href: `${base}/chores`, label: 'Chores', icon: Sparkles, urgent: urgent.has('chore') },
]

const ADDS: Record<string, Category> = { needs: 'need', chores: 'chore', tasks: 'task' }

/**
 * What the + adds on a tab (FRONTEND §5.3): that tab's kind. Only Needs, Tasks and Chores have a
 * + (T107); anywhere else this is undefined and there's no +.
 */
export const addKindFor = (base: string, tabHref: string): Category | undefined =>
  ADDS[tabHref.slice(base.length + 1)]
