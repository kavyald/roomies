import { NeedsScreen } from '@/components/needs/NeedsScreen'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Needs · Roomies' }

export default async function NeedsPage({ params }: PageProps<'/h/[houseId]/needs'>) {
  const { houseId } = await params
  return (
    <main>
      <ScreenHeader title="Needs" />
      <NeedsScreen houseId={houseId as HouseId} />
    </main>
  )
}
