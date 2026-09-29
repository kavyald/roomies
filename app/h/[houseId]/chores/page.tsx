import { Sparkles } from 'lucide-react'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import { EmptyState } from '@/components/ui/EmptyState'

export const metadata = { title: 'Chores · Roomies' }

export default function ChoresPage() {
  return (
    <main>
      <ScreenHeader title="Chores" />
      <EmptyState icon={Sparkles}>Nothing to do. Enjoy the quiet.</EmptyState>
    </main>
  )
}
