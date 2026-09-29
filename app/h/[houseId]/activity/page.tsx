import { ActivityScreen } from '@/components/activity/ActivityScreen'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Activity · Roomies' }

export default async function ActivityPage({ params }: PageProps<'/h/[houseId]/activity'>) {
  const { houseId } = await params
  return (
    <main>
      <ScreenHeader title="Activity" />
      <ActivityScreen houseId={houseId as HouseId} />
    </main>
  )
}
