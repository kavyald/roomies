import { OpenRun } from '@/components/shell/DeepLinks'
import type { HouseId, RunId } from '@/lib/domain/ids'

export const metadata = { title: 'Run · Roomies' }

export default async function RunLink({ params }: PageProps<'/h/[houseId]/r/[runId]'>) {
  const { houseId, runId } = await params
  return <OpenRun houseId={houseId as HouseId} runId={runId as RunId} />
}
