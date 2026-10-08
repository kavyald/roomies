import { ScreenHeader } from '@/components/shell/ScreenHeader'
import { TasksScreen } from '@/components/tasks/TasksScreen'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Tasks · Roomies' }

export default async function TasksPage({ params }: PageProps<'/h/[houseId]/tasks'>) {
  const { houseId } = await params
  return (
    <main>
      <ScreenHeader title="Tasks" />
      <TasksScreen houseId={houseId as HouseId} />
    </main>
  )
}
