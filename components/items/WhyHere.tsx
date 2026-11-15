'use client'

import Link from 'next/link'
import { TierChip } from '@/components/ui/Chip'
import { Disclosure } from '@/components/ui/Disclosure'
import { useFeelings, useHouse } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import type { HouseId, UserId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
import { chipTier, describePart, scorePriority } from '@/lib/domain/priority'

/**
 * "Why it's near the top" (FRONTEND §5.4, T108): a closed section showing the item's Urgent or Soon
 * chip, if it has one; open, what moved it, in words ("Normal priority", "Kavya is 😤", "Due
 * Friday"), never points, and a link to House → How feelings raise priority.
 */
export function WhyHere({
  houseId,
  item,
  name,
  onLeave,
}: {
  houseId: HouseId
  item: Item
  name: (id: UserId) => string
  /** Closes the sheet as the link goes to House. */
  onLeave: () => void
}) {
  const house = useHouse(houseId)
  const feelings = useFeelings(houseId)
  const now = useNow()
  if (!house.data || !feelings.data) return null

  const s = scorePriority(
    item,
    feelings.data,
    house.data.settings.feelingWeights,
    now,
    house.data.settings.timezone,
  )
  const tier = chipTier(s.tier)
  return (
    <Disclosure title="Why it's near the top" summary={tier && <TierChip tier={tier} />}>
      <div className="grid gap-2 rounded-2xl bg-paper px-3.5 py-3 text-sm">
        <ul className="m-0 grid list-none gap-1.5 p-0 font-semibold">
          {s.breakdown.map((p, i) => (
            <li key={i}>{describePart(p, name)}</li>
          ))}
        </ul>
        <Link
          href={`/h/${houseId}?priority`}
          onClick={onLeave}
          className="flex min-h-11 items-center font-extrabold text-accent-ink"
        >
          How feelings raise priority
        </Link>
      </div>
    </Disclosure>
  )
}
