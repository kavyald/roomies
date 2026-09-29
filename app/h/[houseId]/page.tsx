import { Heart } from 'lucide-react'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import { EmptyState } from '@/components/ui/EmptyState'

export const metadata = { title: 'Home · Roomies' }

export default function HouseHomePage() {
  return (
    <main>
      <ScreenHeader title="Home" />
      <EmptyState icon={Heart}>Nothing needs attention right now. Enjoy the quiet.</EmptyState>
    </main>
  )
}
