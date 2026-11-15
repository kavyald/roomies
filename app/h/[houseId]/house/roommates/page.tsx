import { RoommatesScreen } from '@/components/house/SetupScreens'
import { BackToHouse } from '@/components/shell/BackToHouse'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Roommates · Roomies' }

export default async function RoommatesPage({ params }: PageProps<'/h/[houseId]/house/roommates'>) {
  const { houseId } = await params
  return (
    <main>
      <BackToHouse houseId={houseId as HouseId} />
      <ScreenHeader title="Roommates" />
      <RoommatesScreen houseId={houseId as HouseId} />
    </main>
  )
}
