'use client'

import { useCardContext } from '@/components/items/useCardContext'
import { useHouse, useItemActivity } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { relativeTime } from '@/lib/domain/format'
import type { HouseId, ItemId } from '@/lib/domain/ids'
import { itemPath, type RunStep } from '@/lib/domain/runs'

/**
 * An item's path through runs (PRD §6.5 "History"): "Added to Groceries → Moved to Saturday · Sold
 * out → Done", from its activity.
 */
export function ItemRunPath({ houseId, itemId }: { houseId: HouseId; itemId: ItemId }) {
  const activity = useItemActivity(houseId, itemId)
  const ctx = useCardContext(houseId)
  const house = useHouse(houseId)
  const now = useNow()
  const steps = activity.data ? itemPath(activity.data, itemId) : []
  if (steps.length === 0) return null
  const tz = house.data?.settings.timezone ?? 'UTC'
  const label = (id: string) => ctx.run(id)?.label ?? 'a run'
  const line = (s: RunStep) => {
    const base =
      s.what === 'added'
        ? `Added to ${label(s.runId)}`
        : s.what === 'done'
          ? `Done on ${label(s.runId)}`
          : s.what === 'returned'
            ? `Back in the pool from ${label(s.runId)}`
            : `Moved to ${label(s.what.movedTo)}`
    return s.note ? `${base} · ${s.note}` : base
  }
  return (
    <section aria-label="Run history" className="grid gap-2">
      <h3 className="m-0 text-[0.8rem] font-extrabold tracking-[.06em] text-ink-soft uppercase">
        History
      </h3>
      <ol className="m-0 grid list-none gap-1.5 p-0 text-sm">
        {steps.map((s) => (
          <li key={s.id} className="flex justify-between gap-3">
            <span className="font-semibold">{line(s)}</span>
            <span className="flex-none text-ink-soft">{relativeTime(s.at, now, tz)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
