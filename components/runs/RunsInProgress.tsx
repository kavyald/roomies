'use client'

import { useItemSheets } from '@/components/items/ItemSheets'
import { useCardContext } from '@/components/items/useCardContext'
import { RUN_ICON } from '@/components/runs/meta'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { cn } from '@/components/ui/cn'
import { useHouse, useItems, useRunActivity, useRuns } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { describeWhen } from '@/lib/domain/format'
import { runsInProgress } from '@/lib/domain/calendar'
import type { HouseId } from '@/lib/domain/ids'
import { runLedger, runProgress, runSteps, type Run } from '@/lib/domain/runs'

/**
 * "Runs in progress" on Needs (FRONTEND §5.5, T107; on Home before): "Wren's grocery run · 1/3 · Sat".
 * Every open batch; visits coming up are on Tasks (T108).
 */
export function RunsInProgress({ houseId, className }: { houseId: HouseId; className?: string }) {
  const runs = useRuns(houseId)
  const open = runsInProgress(runs.data ?? [])
  if (open.length === 0) return null
  return (
    <section aria-labelledby="runs-in-progress" className={cn('grid gap-2.5', className)}>
      <h2 id="runs-in-progress" className="m-0 text-lg font-extrabold">
        Runs in progress
      </h2>
      <ListGroup label="Runs in progress">
        {open.map((r) => (
          <RunRow key={r.id} houseId={houseId} run={r} />
        ))}
      </ListGroup>
    </section>
  )
}

function RunRow({ houseId, run }: { houseId: HouseId; run: Run }) {
  const { openRun } = useItemSheets()
  const ctx = useCardContext(houseId)
  const activity = useRunActivity(houseId, run.id)
  const items = useItems(houseId)
  const house = useHouse(houseId)
  const now = useNow()
  const Icon = RUN_ICON[run.kind]
  const { done, total } = runProgress(
    runLedger(run.id, runSteps(activity.data ?? []), items.data ?? []),
  )
  const when =
    run.kind !== 'request' && run.when
      ? describeWhen(run.when, now, house.data?.settings.timezone ?? 'UTC')
      : undefined
  return (
    <ListRow
      leading={<Icon aria-hidden className="size-5 text-ink-soft" />}
      title={ctx.run(run.id)?.label ?? 'Run'}
      subtitle={[`${done}/${total}`, when].filter(Boolean).join(' · ')}
      onClick={() => openRun(run.id)}
    />
  )
}
