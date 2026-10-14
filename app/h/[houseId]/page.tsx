import { HomeScreen } from '@/components/home/HomeScreen'
import { MeLink } from '@/components/shell/MeLink'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Home · Roomies' }

export default async function HouseHomePage({ params }: PageProps<'/h/[houseId]'>) {
  const { houseId } = await params
  return (
    <main>
      <ScreenHeader title="Home" trailing={<MeLink houseId={houseId as HouseId} />} />
      <HomeScreen houseId={houseId as HouseId} />
    </main>
  )
}
