import { redirect } from 'next/navigation'
import { AppShell } from '@/components/shell/AppShell'
import { HouseProviders } from '@/components/shell/HouseProviders'
import type { HouseId } from '@/lib/domain/ids'
import { currentUserId } from '@/lib/server/session'

export default async function HouseLayout({ children, params }: LayoutProps<'/h/[houseId]'>) {
  const { houseId } = await params
  const me = await currentUserId()
  if (!me) redirect('/sign-in')
  return (
    <HouseProviders houseId={houseId as HouseId} me={me}>
      <AppShell base={`/h/${houseId}`}>{children}</AppShell>
    </HouseProviders>
  )
}
