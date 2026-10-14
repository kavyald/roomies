'use client'

import { useItemSheets } from '@/components/items/ItemSheets'
import { useCardContext } from '@/components/items/useCardContext'
import { RUN_ICON } from '@/components/runs/meta'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { useHouse, useItems, useRunActivity, useRuns } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { describeWhen } from '@/lib/domain/format'
import { homeRuns } from '@/lib/domain/calendar'
import type { HouseId } from '@/lib/domain/ids'
import { runLedger, runProgress, runSteps, type Run } from '@/lib/domain/runs'
import { localDateOf } from '@/lib/domain/time'

/**
 * Home's "Runs in progress" (FRONTEND §5.1): "Wren's grocery run · 1/3 · Sat". Every open batch,
 * plus visits dated this week (they were in Coming up before T81).
 */
export function RunsInProgress({ houseId }: { houseId: HouseId }) {
  const runs = useRuns(houseId)
  const house = useHouse(houseId)
  const now = useNow()
  if (!house.data) return null
  const open = homeRuns(runs.data ?? [], localDateOf(now, house.data.settings.timezone))
  if (open.length === 0) return null
  return (
    <section aria-labelledby="runs-in-progress" className="grid gap-2.5">
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
