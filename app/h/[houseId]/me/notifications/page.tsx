import { BackToYou } from '@/components/me/BackToYou'
import { NotificationsScreen } from '@/components/me/NotificationsScreen'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Notifications · Roomies' }

export default async function NotificationsPage({
  params,
}: PageProps<'/h/[houseId]/me/notifications'>) {
  const { houseId } = await params
  return (
    <main>
      <BackToYou houseId={houseId as HouseId} />
      <ScreenHeader title="Notifications" />
      <NotificationsScreen houseId={houseId as HouseId} />
    </main>
  )
}
