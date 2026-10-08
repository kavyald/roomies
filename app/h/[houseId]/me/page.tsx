import { MeScreen } from '@/components/me/MeScreen'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'You · Roomies' }

export default async function MePage({ params }: PageProps<'/h/[houseId]/me'>) {
  const { houseId } = await params
  return (
    <main>
      <ScreenHeader title="You" />
      <MeScreen houseId={houseId as HouseId} />
    </main>
  )
}
