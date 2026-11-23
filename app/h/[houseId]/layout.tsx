import { redirect } from 'next/navigation'
import { AppShell } from '@/components/shell/AppShell'
import { HouseProviders } from '@/components/shell/HouseProviders'
import { makeWhereTo } from '@/lib/app/session'
import { depsForRequest } from '@/lib/compose'
import { serverConfig } from '@/lib/config'
import type { HouseId } from '@/lib/domain/ids'
import { currentUserId } from '@/lib/server/session'
import { SERVER_TIMING_META, serverTiming, timed } from '@/lib/server/timing'

export default async function HouseLayout({ children, params }: LayoutProps<'/h/[houseId]'>) {
  const { houseId } = await params
  // The verified check (Supabase Auth): the proxy's is only a quick look at the cookie (§5.4).
  const [me, authMs] = await timed(() => currentUserId())
  if (!me) redirect('/sign-in')
  // Only active members get the house pages; anyone else goes to '/', which explains.
  const [dest, membershipMs] = await timed(() =>
    makeWhereTo(depsForRequest({ actor: { kind: 'user', userId: me } }))(me),
  )
  if (dest.to !== 'house' || dest.houseId !== houseId) redirect('/')
  return (
    <HouseProviders houseId={houseId as HouseId} me={me} build={serverConfig().appVersion}>
      {/* How long the server spent before rendering (T115); React puts it in <head>. */}
      <meta
        name={SERVER_TIMING_META}
        content={serverTiming([
          { name: 'auth', ms: authMs, desc: 'Supabase Auth' },
          { name: 'membership', ms: membershipMs, desc: 'Membership' },
        ])}
      />
      <AppShell houseId={houseId as HouseId} base={`/h/${houseId}`}>
        {children}
      </AppShell>
    </HouseProviders>
  )
}
