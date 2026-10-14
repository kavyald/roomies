import { CheckCircle, House, ShoppingBag, Sparkles, Users } from 'lucide-react'
import type { Tab } from '@/components/ui/TabBar'
import type { Category } from '@/lib/domain/items'

/** Home · Needs · Tasks · Chores · Admin (FRONTEND §5, T67). Everyone sees "Admin". */
export const houseTabs = (base: string): Tab[] => [
  { href: base, label: 'Home', icon: House },
  { href: `${base}/needs`, label: 'Needs', icon: ShoppingBag },
  { href: `${base}/tasks`, label: 'Tasks', icon: CheckCircle },
  { href: `${base}/chores`, label: 'Chores', icon: Sparkles },
  { href: `${base}/admin`, label: 'Admin', icon: Users },
]

const ADDS: Record<string, Category> = { needs: 'need', chores: 'chore', tasks: 'task' }

/** What the + adds on a tab (FRONTEND §5.3): that tab's kind, or nothing (the picker). */
export const addKindFor = (base: string, tabHref: string): Category | undefined =>
  ADDS[tabHref.slice(base.length + 1)]
