import { OpenItem } from '@/components/items/OpenItem'
import type { ItemId } from '@/lib/domain/ids'

export default async function ItemLink({ params }: PageProps<'/h/[houseId]/i/[itemId]'>) {
  const { houseId, itemId } = await params
  return <OpenItem base={`/h/${houseId}`} itemId={itemId as ItemId} />
}
