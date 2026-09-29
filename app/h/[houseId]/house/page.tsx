import { ScreenHeader } from '@/components/shell/ScreenHeader'
import { HouseScreen } from '@/components/house/HouseScreen'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'House · Roomies' }

export default async function HouseTabPage({ params }: PageProps<'/h/[houseId]/house'>) {
  const { houseId } = await params
  return (
    <main>
      <ScreenHeader title="House" />
      <HouseScreen houseId={houseId as HouseId} />
    </main>
  )
}
