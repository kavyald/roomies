import { ContactsScreen } from '@/components/house/SetupScreens'
import { BackToHouse } from '@/components/shell/BackToHouse'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Contacts · Roomies' }

export default async function ContactsPage({ params }: PageProps<'/h/[houseId]/house/contacts'>) {
  const { houseId } = await params
  return (
    <main>
      <BackToHouse houseId={houseId as HouseId} />
      <ScreenHeader title="Contacts" />
      <ContactsScreen houseId={houseId as HouseId} />
    </main>
  )
}
