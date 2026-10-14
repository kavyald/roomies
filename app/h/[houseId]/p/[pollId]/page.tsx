import { OpenPoll } from '@/components/shell/DeepLinks'
import type { HouseId, PollId } from '@/lib/domain/ids'

export const metadata = { title: 'Poll · Roomies' }

export default async function PollLink({ params }: PageProps<'/h/[houseId]/p/[pollId]'>) {
  const { houseId, pollId } = await params
  return <OpenPoll houseId={houseId as HouseId} pollId={pollId as PollId} />
}
