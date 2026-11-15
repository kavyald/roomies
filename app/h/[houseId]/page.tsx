import { HouseScreen } from '@/components/house/HouseScreen'
import { MeLink } from '@/components/shell/MeLink'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'House · Roomies' }

/** The House tab (T107): the first tab, and where opening the app lands. */
export default async function HousePage({ params, searchParams }: PageProps<'/h/[houseId]'>) {
  const { houseId } = await params
  // An item's "How feelings raise priority" link lands here with ?priority (T108).
  const showWeights = 'priority' in (await searchParams)
  return (
    <main>
      <ScreenHeader title="House" trailing={<MeLink houseId={houseId as HouseId} />} />
      <HouseScreen houseId={houseId as HouseId} showWeights={showWeights} />
    </main>
  )
}
