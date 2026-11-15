import { ChoresScreen } from '@/components/chores/ChoresScreen'
import { MeLink } from '@/components/shell/MeLink'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Chores · Roomies' }

export default async function ChoresPage({ params }: PageProps<'/h/[houseId]/chores'>) {
  const { houseId } = await params
  return (
    <main>
      <ScreenHeader title="Chores" trailing={<MeLink houseId={houseId as HouseId} />} />
      <ChoresScreen houseId={houseId as HouseId} />
    </main>
  )
}
