'use client'

import { BarChart3, Plus } from 'lucide-react'
import { useItemSheets } from '@/components/items/ItemSheets'
import { Button } from '@/components/ui/Button'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { useMembers, usePolls } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import type { HouseId } from '@/lib/domain/ids'
import { housePolls } from '@/lib/domain/polls'

/**
 * House's Polls (FRONTEND §5.1, T107): open ones first ("Which vacuum? · 2/4 voted"), then the
 * latest closed ones with their result, and **New poll**. Tap one to open it.
 */
export function HousePolls({ houseId }: { houseId: HouseId }) {
  const polls = usePolls(houseId)
  const members = useMembers(houseId)
  const { openPoll, newPoll } = useItemSheets()
  const now = useNow()
  const list = housePolls(polls.data ?? [], now)
  const active = (members.data ?? []).filter((m) => m.status.active).length
  return (
    <section aria-labelledby="polls" className="grid gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="polls" className="m-0 text-lg font-extrabold">
          Polls
        </h2>
        <Button size="small" variant="secondary" onClick={() => newPoll()}>
          <Plus aria-hidden className="size-4" /> New poll
        </Button>
      </div>
      {list.length === 0 ? (
        <p className="m-0 text-sm font-semibold text-ink-soft">
          No polls yet. Ask the house when you can&apos;t decide.
        </p>
      ) : (
        <ListGroup label="Polls">
          {list.map(({ poll, open, result }) => (
            <ListRow
              key={poll.id}
              leading={<BarChart3 aria-hidden className="size-5 text-ink-soft" />}
              title={poll.question}
              subtitle={open ? `${poll.votes.length}/${active} voted` : `Closed · ${result}`}
              onClick={() => openPoll(poll.id)}
            />
          ))}
        </ListGroup>
      )}
    </section>
  )
}
