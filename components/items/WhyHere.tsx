'use client'

import { TierChip } from '@/components/ui/Chip'
import { Disclosure } from '@/components/ui/Disclosure'
import { useFeelings, useHouse } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import type { HouseId, UserId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
import { describePart, scorePriority, signedPoints } from '@/lib/domain/priority'

/**
 * "Why is this here?" (FRONTEND §5.4): a closed section showing the item's tier; open, the score
 * breakdown behind it.
 */
export function WhyHere({
  houseId,
  item,
  name,
}: {
  houseId: HouseId
  item: Item
  name: (id: UserId) => string
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
  return (
    <Disclosure title="Why is this here?" summary={<TierChip tier={s.tier} />}>
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 rounded-2xl bg-paper px-3.5 py-3 text-sm">
        {s.breakdown.map((p, i) => (
          <div key={i} className="contents">
            <dt className="font-semibold">{describePart(p, name)}</dt>
            <dd className="m-0 text-right font-bold tabular-nums">{signedPoints(p.points)}</dd>
          </div>
        ))}
        <div className="col-span-2 flex justify-between border-t border-line pt-1.5 font-extrabold">
          <dt>Score</dt>
          <dd className="m-0 tabular-nums">{s.score}</dd>
        </div>
      </dl>
    </Disclosure>
  )
}
