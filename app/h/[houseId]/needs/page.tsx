import { NeedsScreen } from '@/components/needs/NeedsScreen'
import { RunsInProgress } from '@/components/runs/RunsInProgress'
import { MeLink } from '@/components/shell/MeLink'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Needs · Roomies' }

export default async function NeedsPage({ params }: PageProps<'/h/[houseId]/needs'>) {
  const { houseId } = await params
  return (
    <main>
      <ScreenHeader title="Needs" trailing={<MeLink houseId={houseId as HouseId} />} />
      {/* Open batches at the top, where runs start (T108); visits coming up are on Tasks. */}
      <RunsInProgress houseId={houseId as HouseId} className="mb-5" />
      <NeedsScreen houseId={houseId as HouseId} />
    </main>
  )
}
