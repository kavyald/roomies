import { CheckCircle } from 'lucide-react'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import { EmptyState } from '@/components/ui/EmptyState'

export const metadata = { title: 'Tasks · Roomies' }

export default function TasksPage() {
  return (
    <main>
      <ScreenHeader title="Tasks" />
      <EmptyState icon={CheckCircle}>No tasks yet. Add one when something needs doing.</EmptyState>
    </main>
  )
}
