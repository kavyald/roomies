'use client'

import { CheckCircle } from 'lucide-react'
import { useState } from 'react'
import { useItemSheets } from '@/components/items/ItemSheets'
import { ItemCard } from '@/components/items/ItemCard'
import { whenLabel } from '@/components/items/meta'
import { useCardContext } from '@/components/items/useCardContext'
import { ComingUpVisits, RequestsAndVisits } from '@/components/runs/RequestsAndVisits'
import { EmptyState } from '@/components/ui/EmptyState'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useCelebrate, useToast } from '@/components/ui/Toast'
import {
  useRanking,
  useFeelingsByItem,
  useHouse,
  useItems,
  useMarkDone,
  useReopenItem,
} from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import { useNow } from '@/lib/client/use-now'
import type { HouseId } from '@/lib/domain/ids'
import { taskList, type TaskFilter } from '@/lib/domain/lists'
import { chipTier } from '@/lib/domain/priority'

const EMPTY: Record<TaskFilter, string> = {
  all: 'No tasks right now. Add one with the + when something needs doing.',
  mine: "Nothing's on you right now.",
  outside: 'Nothing is waiting on outside help.',
}

/**
 * Tasks (FRONTEND §5.7, T108): visits coming up this week, then Mine / All / Outside help, ranked
 * by priority with an Urgent or Soon chip where it applies, then the other open requests and
 * visits. The + is the one way to add (a task, or a request or visit from its tiles).
 */
export function TasksScreen({ houseId }: { houseId: HouseId }) {
  const { me } = useAppClient()
  const items = useItems(houseId)
  const house = useHouse(houseId)
  const ranking = useRanking(houseId)
  const ctx = useCardContext(houseId)
  const feelingsBy = useFeelingsByItem(houseId)
  const { openItem } = useItemSheets()
  const done = useMarkDone(houseId)
  const reopen = useReopenItem(houseId)
  const toast = useToast()
  const celebrate = useCelebrate()
  const now = useNow()
  const [filter, setFilter] = useState<TaskFilter>('all')

  if (items.isError) {
    return (
      <p role="alert" className="font-bold text-ink-soft">
        Couldn&apos;t reach the house. Check your connection and try again.
      </p>
    )
  }
  if (items.isPending) return <p className="text-ink-soft">Loading…</p>

  const tz = house.data?.settings.timezone ?? 'UTC'
  const tasks = taskList(items.data, filter, me, ranking)

  return (
    <div className="grid gap-3">
      <ComingUpVisits houseId={houseId} />
      <SegmentedControl
        label="Which tasks"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'mine', label: 'Mine' },
          { value: 'all', label: 'All' },
          { value: 'outside', label: 'Outside help' },
        ]}
      />
      {tasks.length === 0 ? (
        <EmptyState icon={CheckCircle}>{EMPTY[filter]}</EmptyState>
      ) : (
        <ul aria-label="Tasks" className="m-0 grid list-none gap-3 p-0">
          {tasks.map(({ item: t, score }) => (
            <li key={t.id}>
              <ItemCard
                item={t}
                ctx={ctx}
                tier={chipTier(score.tier)}
                feelings={feelingsBy.get(t.id)}
                meta={whenLabel(t, now, tz)}
                onOpen={() => openItem(t.id)}
                checkLabel={`Done: ${t.title}`}
                onCheck={async () => {
                  const r = await done.mutateAsync(t.id)
                  if (r.ok) celebrate()
                  toast(
                    r.ok ? 'Done. 💛' : "Couldn't mark it done. Try again.",
                    r.ok ? { label: 'Undo', onClick: () => reopen.mutate(t.id) } : undefined,
                  )
                }}
              />
            </li>
          ))}
        </ul>
      )}
      <RequestsAndVisits houseId={houseId} />
    </div>
  )
}
