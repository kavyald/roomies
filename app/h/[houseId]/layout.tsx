import { AppShell } from '@/components/shell/AppShell'
import { HouseProviders } from '@/components/shell/HouseProviders'
import type { HouseId } from '@/lib/domain/ids'

export default async function HouseLayout({ children, params }: LayoutProps<'/h/[houseId]'>) {
  const { houseId } = await params
  return (
    <HouseProviders houseId={houseId as HouseId}>
      <AppShell base={`/h/${houseId}`}>{children}</AppShell>
    </HouseProviders>
  )
}
