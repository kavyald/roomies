import { ScreenHeader } from '@/components/shell/ScreenHeader'
import { AdminScreen } from '@/components/house/AdminScreen'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { DeleteAccount } from '@/components/house/AccountSection'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Admin · Roomies' }

export default async function AdminTabPage({ params }: PageProps<'/h/[houseId]/admin'>) {
  const { houseId } = await params
  return (
    <main>
      <ScreenHeader title="Admin" />
      <AdminScreen houseId={houseId as HouseId} />
      <div className="mt-8 grid justify-items-center gap-2">
        <SignOutButton />
        <DeleteAccount />
      </div>
    </main>
  )
}
