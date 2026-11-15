'use client'

import { useItemSheets } from '@/components/items/ItemSheets'
import { useCardContext } from '@/components/items/useCardContext'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { useHouse, useItems, useRuns } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { visitsComingUp } from '@/lib/domain/calendar'
import { describeWhen } from '@/lib/domain/format'
import type { HouseId } from '@/lib/domain/ids'
import { isRunOpen, type Run } from '@/lib/domain/runs'
import { localDateOf } from '@/lib/domain/time'
import { RUN_ICON, requestStage } from './meta'

const ORDER = (r: Run) =>
  r.kind === 'request' ? (r.state.at === 'gathering' ? 0 : 1) : r.kind === 'visit' ? 2 : 3

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`)

/**
 * The open requests and visits on Tasks (FRONTEND §5.7, T108), split in two: visits dated in the
 * coming week ("Coming up", at the top) and the rest (unsent lists, sent requests, later visits,
 * under the tasks). Each section shows only when it has something; requests and visits start from
 * the + sheet or from a task, so neither has a New button.
 */
function useTaskRuns(houseId: HouseId) {
  const runs = useRuns(houseId)
  const house = useHouse(houseId)
  const now = useNow()
  const tz = house.data?.settings.timezone ?? 'UTC'
  const soon = visitsComingUp(runs.data ?? [], localDateOf(now, tz))
  const soonIds = new Set(soon.map((r) => r.id))
  const rest = (runs.data ?? [])
    .filter((r) => r.kind !== 'batch' && isRunOpen(r) && !soonIds.has(r.id))
    .sort((a, b) => ORDER(a) - ORDER(b) || a.createdAt.epochMs - b.createdAt.epochMs)
  return { soon, rest }
}

function RunSection({
  houseId,
  heading,
  runs,
}: {
  houseId: HouseId
  heading: string
  runs: readonly Run[]
}) {
  const items = useItems(houseId)
  const house = useHouse(houseId)
  const ctx = useCardContext(houseId)
  const { openRun } = useItemSheets()
  const now = useNow()
  const tz = house.data?.settings.timezone ?? 'UTC'
  if (runs.length === 0) return null
  const onRun = (r: Run) => (items.data ?? []).filter((i) => i.run?.id === r.id).length

  const subtitle = (r: Run) => {
    const n = onRun(r)
    if (r.kind === 'request') {
      return r.state.at === 'gathering'
        ? `${requestStage(r, now, tz)} · ${count(n, 'task', 'tasks')}`
        : `${requestStage(r, now, tz)} · waiting on ${n}`
    }
    const when = r.kind === 'visit' && r.when ? describeWhen(r.when, now, tz) : 'Date TBD'
    return `${when} · ${n} to look at`
  }
  const id = heading.toLowerCase().replace(/\W+/g, '-')

  return (
    <section aria-labelledby={id} className="grid gap-2.5">
      <h2 id={id} className="m-0 text-lg font-extrabold">
        {heading}
      </h2>
      <ListGroup label={heading}>
        {runs.map((r) => {
          const Icon = RUN_ICON[r.kind]
          return (
            <ListRow
              key={r.id}
              leading={<Icon aria-hidden className="size-5 text-ink-soft" />}
              title={ctx.run(r.id)?.label ?? 'Run'}
              subtitle={subtitle(r)}
              onClick={() => openRun(r.id)}
            />
          )
        })}
      </ListGroup>
    </section>
  )
}

/** "Coming up" at the top of Tasks: visits dated today and the six days after. */
export function ComingUpVisits({ houseId }: { houseId: HouseId }) {
  const { soon } = useTaskRuns(houseId)
  return <RunSection houseId={houseId} heading="Coming up" runs={soon} />
}

/** "Requests & visits" under the tasks: unsent lists, then sent requests, then later visits. */
export function RequestsAndVisits({ houseId }: { houseId: HouseId }) {
  const { rest } = useTaskRuns(houseId)
  return <RunSection houseId={houseId} heading="Requests & visits" runs={rest} />
}
