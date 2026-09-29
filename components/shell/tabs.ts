import { CheckCircle, House, ShoppingBag, Sparkles, Users } from 'lucide-react'
import type { Tab } from '@/components/ui/TabBar'

/** Home · Needs · Chores · Tasks · House (FRONTEND §5). */
export const houseTabs = (base: string): Tab[] => [
  { href: base, label: 'Home', icon: House },
  { href: `${base}/needs`, label: 'Needs', icon: ShoppingBag },
  { href: `${base}/chores`, label: 'Chores', icon: Sparkles },
  { href: `${base}/tasks`, label: 'Tasks', icon: CheckCircle },
  { href: `${base}/house`, label: 'House', icon: Users },
]
