'use client'

import { Plus, Send } from 'lucide-react'
import { useState } from 'react'
import { useItemSheets } from '@/components/items/ItemSheets'
import { useCardContext } from '@/components/items/useCardContext'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { useHouse, useItems, useRuns } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { describeWhen } from '@/lib/domain/format'
import type { HouseId } from '@/lib/domain/ids'
import { isRunOpen, type Run } from '@/lib/domain/runs'
import { RUN_ICON, requestStage } from './meta'
import { NewRunSheet } from './NewRunSheet'

const ORDER = (r: Run) =>
  r.kind === 'request' ? (r.state.at === 'gathering' ? 0 : 1) : r.kind === 'visit' ? 2 : 3

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`)

/**
 * "Requests & visits" at the top of Tasks (FRONTEND §5.7): unsent lists first, then sent requests,
 * then visits, with **+ New** to start one.
 */
export function RequestsAndVisits({ houseId }: { houseId: HouseId }) {
  const runs = useRuns(houseId)
  const items = useItems(houseId)
  const house = useHouse(houseId)
  const ctx = useCardContext(houseId)
  const { openRun } = useItemSheets()
  const now = useNow()
  const [creating, setCreating] = useState(false)
  const tz = house.data?.settings.timezone ?? 'UTC'

  const open = (runs.data ?? [])
    .filter((r) => r.kind !== 'batch' && isRunOpen(r))
    .sort((a, b) => ORDER(a) - ORDER(b) || a.createdAt.epochMs - b.createdAt.epochMs)
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

  return (
    <section aria-labelledby="requests-and-visits" className="grid gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="requests-and-visits" className="m-0 text-lg font-extrabold">
          Requests &amp; visits
        </h2>
        <Button variant="secondary" size="small" onClick={() => setCreating(true)}>
          <Plus aria-hidden className="size-4" /> New
        </Button>
      </div>
      {open.length === 0 ? (
        <EmptyState icon={Send}>
          No requests yet. Start one when something needs the landlord or super.
        </EmptyState>
      ) : (
        <ListGroup label="Requests & visits">
          {open.map((r) => {
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
      )}
      {creating && (
        <NewRunSheet
          houseId={houseId}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            openRun(id)
          }}
        />
      )}
    </section>
  )
}
