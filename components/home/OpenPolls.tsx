'use client'

import { BarChart3 } from 'lucide-react'
import { useItemSheets } from '@/components/items/ItemSheets'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { useMembers, usePolls } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import type { HouseId } from '@/lib/domain/ids'
import { isPollOpen } from '@/lib/domain/polls'

/** Home's "Open polls" (FRONTEND §5.1): "Which vacuum? · 2/4 voted". */
export function OpenPolls({ houseId }: { houseId: HouseId }) {
  const polls = usePolls(houseId)
  const members = useMembers(houseId)
  const { openPoll } = useItemSheets()
  const now = useNow()
  const open = (polls.data ?? []).filter((p) => isPollOpen(p, now))
  if (open.length === 0) return null
  const active = (members.data ?? []).filter((m) => m.status.active).length
  return (
    <section aria-labelledby="open-polls" className="grid gap-2.5">
      <h2 id="open-polls" className="m-0 text-lg font-extrabold">
        Open polls
      </h2>
      <ListGroup label="Open polls">
        {open.map((p) => (
          <ListRow
            key={p.id}
            leading={<BarChart3 aria-hidden className="size-5 text-ink-soft" />}
            title={p.question}
            subtitle={`${p.votes.length}/${active} voted`}
            onClick={() => openPoll(p.id)}
          />
        ))}
      </ListGroup>
    </section>
  )
}
