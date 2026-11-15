import { RoutinesSection } from '@/components/house/RoutinesSection'
import { BackToHouse } from '@/components/shell/BackToHouse'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Routines · Roomies' }

export default async function RoutinesPage({ params }: PageProps<'/h/[houseId]/house/routines'>) {
  const { houseId } = await params
  return (
    <main>
      <BackToHouse houseId={houseId as HouseId} />
      <ScreenHeader title="Routines" />
      <RoutinesSection houseId={houseId as HouseId} />
    </main>
  )
}
