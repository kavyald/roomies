import { CalendarScreen } from '@/components/calendar/CalendarScreen'
import { BackToHouse } from '@/components/shell/BackToHouse'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Calendar · Roomies' }

export default async function CalendarPage({ params }: PageProps<'/h/[houseId]/calendar'>) {
  const { houseId } = await params
  return (
    <main>
      <BackToHouse houseId={houseId as HouseId} />
      <ScreenHeader title="Calendar" />
      <CalendarScreen houseId={houseId as HouseId} />
    </main>
  )
}
