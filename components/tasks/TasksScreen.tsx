'use client'

import { CheckCircle } from 'lucide-react'
import { useState } from 'react'
import { useItemSheets } from '@/components/items/ItemSheets'
import { ItemCard } from '@/components/items/ItemCard'
import { whenLabel } from '@/components/items/meta'
import { useCardContext } from '@/components/items/useCardContext'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useToast } from '@/components/ui/Toast'
import { useHouse, useItems, useMarkDone, useReopenItem } from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import { useNow } from '@/lib/client/use-now'
import type { HouseId } from '@/lib/domain/ids'
import { taskList, type TaskFilter } from '@/lib/domain/lists'

const EMPTY: Record<TaskFilter, string> = {
  all: 'No tasks right now. Add one when something needs doing.',
  mine: "Nothing's on you right now.",
  outside: 'Nothing is waiting on outside help.',
}

/** Tasks (FRONTEND §5.7): Mine / All / Outside help. Requests & visits join in T30. */
export function TasksScreen({ houseId }: { houseId: HouseId }) {
  const { me } = useAppClient()
  const items = useItems(houseId)
  const house = useHouse(houseId)
  const ctx = useCardContext(houseId)
  const { openItem, openAdd } = useItemSheets()
  const done = useMarkDone(houseId)
  const reopen = useReopenItem(houseId)
  const toast = useToast()
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
  const tasks = taskList(items.data, filter, me)

  return (
    <div className="grid gap-3">
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
        <EmptyState
          icon={CheckCircle}
          action={
            filter === 'all' ? (
              <Button size="small" onClick={() => openAdd('task')}>
                Add a task
              </Button>
            ) : undefined
          }
        >
          {EMPTY[filter]}
        </EmptyState>
      ) : (
        <ul aria-label="Tasks" className="m-0 grid list-none gap-3 p-0">
          {tasks.map((t) => (
            <li key={t.id}>
              <ItemCard
                item={t}
                ctx={ctx}
                hideCategory
                meta={whenLabel(t, now, tz)}
                onOpen={() => openItem(t.id)}
                checkLabel={`Done: ${t.title}`}
                onCheck={async () => {
                  const r = await done.mutateAsync(t.id)
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
    </div>
  )
}
