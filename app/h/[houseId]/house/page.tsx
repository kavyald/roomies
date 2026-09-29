import { Users } from 'lucide-react'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import { EmptyState } from '@/components/ui/EmptyState'

export const metadata = { title: 'House · Roomies' }

export default function HouseTabPage() {
  return (
    <main>
      <ScreenHeader title="House" />
      <EmptyState icon={Users}>Your roommates, rooms, and contacts will live here.</EmptyState>
    </main>
  )
}
