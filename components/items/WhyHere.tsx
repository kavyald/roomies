'use client'

import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { TierChip } from '@/components/ui/Chip'
import { cn } from '@/components/ui/cn'
import { useFeelings, useHouse } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import type { HouseId, UserId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
import { describePart, scorePriority, signedPoints } from '@/lib/domain/priority'

/** "Why is this here?" (FRONTEND §5.4): the item's tier and the score breakdown behind it. */
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
  const [open, setOpen] = useState(false)
  if (!house.data || !feelings.data) return null

  const s = scorePriority(
    item,
    feelings.data,
    house.data.settings.feelingWeights,
    now,
    house.data.settings.timezone,
  )
  return (
    <section aria-label="Why is this here?" className="grid gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center gap-2 justify-self-start text-sm font-bold text-ink-soft"
      >
        <TierChip tier={s.tier} />
        Why is this here?
        <ChevronDown aria-hidden className={cn('size-4', open && 'rotate-180')} />
      </button>
      {open && (
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
      )}
    </section>
  )
}
