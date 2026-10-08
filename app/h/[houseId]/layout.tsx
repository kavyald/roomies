import { redirect } from 'next/navigation'
import { AppShell } from '@/components/shell/AppShell'
import { HouseProviders } from '@/components/shell/HouseProviders'
import { makeWhereTo } from '@/lib/app/session'
import { depsForRequest } from '@/lib/compose'
import type { HouseId } from '@/lib/domain/ids'
import { currentUserId } from '@/lib/server/session'

export default async function HouseLayout({ children, params }: LayoutProps<'/h/[houseId]'>) {
  const { houseId } = await params
  const me = await currentUserId()
  if (!me) redirect('/sign-in')
  // Only active members get the house pages; anyone else goes to '/', which explains.
  const dest = await makeWhereTo(depsForRequest({ actor: { kind: 'user', userId: me } }))(me)
  if (dest.to !== 'house' || dest.houseId !== houseId) redirect('/')
  return (
    <HouseProviders houseId={houseId as HouseId} me={me}>
      <AppShell base={`/h/${houseId}`}>{children}</AppShell>
    </HouseProviders>
  )
}
