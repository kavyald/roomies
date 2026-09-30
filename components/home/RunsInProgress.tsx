'use client'

import { useItemSheets } from '@/components/items/ItemSheets'
import { useCardContext } from '@/components/items/useCardContext'
import { RUN_ICON } from '@/components/runs/meta'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { useHouse, useItems, useRunActivity, useRuns } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { describeWhen } from '@/lib/domain/format'
import type { HouseId } from '@/lib/domain/ids'
import { isRunOpen, runLedger, runProgress, runSteps, type Run } from '@/lib/domain/runs'

/** Home's "Runs in progress" (FRONTEND §5.1): "Wren's grocery run · 1/3 · Sat". */
export function RunsInProgress({ houseId }: { houseId: HouseId }) {
  const runs = useRuns(houseId)
  const open = (runs.data ?? [])
    .filter((r) => r.kind === 'batch' && isRunOpen(r))
    .sort((a, b) => {
      const da = a.kind !== 'request' ? a.when?.date : undefined
      const db = b.kind !== 'request' ? b.when?.date : undefined
      if (da && db && da !== db) return da.localeCompare(db)
      if (da && !db) return -1
      if (db && !da) return 1
      return a.createdAt.epochMs - b.createdAt.epochMs
    })
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
