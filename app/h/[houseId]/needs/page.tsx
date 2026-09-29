import { ShoppingBag } from 'lucide-react'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import { EmptyState } from '@/components/ui/EmptyState'

export const metadata = { title: 'Needs · Roomies' }

export default function NeedsPage() {
  return (
    <main>
      <ScreenHeader title="Needs" />
      <EmptyState icon={ShoppingBag}>Nothing to buy. Nice.</EmptyState>
    </main>
  )
}
