import { CheckCircle, House, ShoppingBag, Sparkles } from 'lucide-react'
import type { Tab } from '@/components/ui/TabBar'
import type { Category } from '@/lib/domain/items'

/** House · Needs · Tasks · Chores (FRONTEND §5, T107). House is the house's own page. */
export const houseTabs = (base: string): Tab[] => [
  { href: base, label: 'House', icon: House },
  { href: `${base}/needs`, label: 'Needs', icon: ShoppingBag },
  { href: `${base}/tasks`, label: 'Tasks', icon: CheckCircle },
  { href: `${base}/chores`, label: 'Chores', icon: Sparkles },
]

const ADDS: Record<string, Category> = { needs: 'need', chores: 'chore', tasks: 'task' }

/**
 * What the + adds on a tab (FRONTEND §5.3): that tab's kind. Only Needs, Tasks and Chores have a
 * + (T107); anywhere else this is undefined and there's no +.
 */
export const addKindFor = (base: string, tabHref: string): Category | undefined =>
  ADDS[tabHref.slice(base.length + 1)]
