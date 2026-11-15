import { NeedsScreen } from '@/components/needs/NeedsScreen'
import { RunsInProgress } from '@/components/runs/RunsInProgress'
import { ScreenHeader } from '@/components/shell/ScreenHeader'
import type { HouseId } from '@/lib/domain/ids'

export const metadata = { title: 'Needs · Roomies' }

export default async function NeedsPage({ params }: PageProps<'/h/[houseId]/needs'>) {
  const { houseId } = await params
  return (
    <main>
      <ScreenHeader title="Needs" />
      {/* Runs in progress moved here with Home (T107); T108 settles where each kind sits. */}
      <RunsInProgress houseId={houseId as HouseId} className="mb-5" />
      <NeedsScreen houseId={houseId as HouseId} />
    </main>
  )
}
