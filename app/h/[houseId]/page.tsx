import { FeedbackButton } from '@/components/house/FeedbackSheet'
import { HouseScreen } from '@/components/house/HouseScreen'
import { MeLink } from '@/components/shell/MeLink'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'House · Roomies' }

/** The House tab (T107): the first tab, and where opening the app lands. */
export default async function HousePage({ params }: PageProps<'/h/[houseId]'>) {
  const { houseId } = await params
  return (
    <main>
      <ScreenHeader
        title="House"
        trailing={
          <div className="flex items-center gap-1">
            <FeedbackButton houseId={houseId as HouseId} />
            <MeLink houseId={houseId as HouseId} />
          </div>
        }
      />
      <HouseScreen houseId={houseId as HouseId} />
    </main>
  )
}
