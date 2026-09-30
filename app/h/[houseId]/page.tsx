import { HomeScreen } from '@/components/home/HomeScreen'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Home · Roomies' }

export default async function HouseHomePage({ params }: PageProps<'/h/[houseId]'>) {
  const { houseId } = await params
  return (
    <main>
      <ScreenHeader title="Home" />
      <HomeScreen houseId={houseId as HouseId} />
    </main>
  )
}
