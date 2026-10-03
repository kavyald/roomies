'use client'

import { useCosts } from '@/lib/client/hooks'
import type { HouseId, RunId } from '@/lib/domain/ids'
import { formatCents, sumCents } from '@/lib/domain/money'
import { CostRows } from './CostRows'

/** "Spent · $42.50" on a run's sheet: the run's costs, to edit or remove (T57). */
export function RunCosts({
  houseId,
  runId,
  label,
}: {
  houseId: HouseId
  runId: RunId
  label: string
}) {
  const costs = useCosts(houseId)
  const mine = (costs.data ?? []).filter((c) => c.for && 'run' in c.for && c.for.run === runId)
  if (mine.length === 0) return null
  return (
    <section aria-labelledby={`run-costs-${runId}`} className="grid gap-1.5">
      <h3 id={`run-costs-${runId}`} className="m-0 text-[0.8rem] font-extrabold text-ink-soft">
        Spent · {formatCents(sumCents(mine.map((c) => c.amount)))}
      </h3>
      <CostRows houseId={houseId} costs={mine} title={label} />
    </section>
  )
}
