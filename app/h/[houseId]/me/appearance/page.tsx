import { AppearanceScreen } from '@/components/me/AppearanceScreen'
import { BackToYou } from '@/components/me/BackToYou'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Appearance · Roomies' }

export default async function AppearancePage({ params }: PageProps<'/h/[houseId]/me/appearance'>) {
  const { houseId } = await params
  return (
    <main>
      <BackToYou houseId={houseId as HouseId} />
      <ScreenHeader title="Appearance" />
      <AppearanceScreen houseId={houseId as HouseId} />
    </main>
  )
}
