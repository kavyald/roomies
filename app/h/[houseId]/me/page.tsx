import { SignOutButton } from '@/components/auth/SignOutButton'
import { DeleteAccount } from '@/components/house/AccountSection'
import { MeScreen } from '@/components/me/MeScreen'
import { BackToHouse } from '@/components/shell/BackToHouse'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'You · Roomies' }

export default async function MePage({ params }: PageProps<'/h/[houseId]/me'>) {
  const { houseId } = await params
  return (
    <main>
      <BackToHouse houseId={houseId as HouseId} />
      <ScreenHeader title="You" />
      <MeScreen houseId={houseId as HouseId} />
      {/* Your account, not the house's (T107): moved here from Admin. */}
      <div className="mt-8 grid justify-items-center gap-2">
        <SignOutButton />
        <DeleteAccount />
      </div>
    </main>
  )
}
