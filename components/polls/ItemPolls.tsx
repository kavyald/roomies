'use client'

import { BarChart3, Plus } from 'lucide-react'
import { useItemSheets } from '@/components/items/ItemSheets'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { usePolls } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import type { HouseId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
import { isPollOpen, resultOf } from '@/lib/domain/polls'
import { resultLine } from './meta'

/** "Polls about this" on an item, and "+ Poll about this" (FRONTEND §5.4). */
export function ItemPolls({ houseId, item }: { houseId: HouseId; item: Item }) {
  const polls = usePolls(houseId)
  const { openPoll, newPoll } = useItemSheets()
  const now = useNow()
  const about = (polls.data ?? []).filter((p) => p.itemId === item.id)
  return (
    <section aria-label="Polls about this" className="grid gap-2">
      {about.length > 0 && (
        <>
          <h3 className="m-0 text-[0.8rem] font-extrabold tracking-[.06em] text-ink-soft uppercase">
            Polls about this
          </h3>
          <ListGroup label="Polls about this">
            {about.map((p) => (
              <ListRow
                key={p.id}
                leading={<BarChart3 aria-hidden className="size-5 text-ink-soft" />}
                title={p.question}
                subtitle={
                  isPollOpen(p, now) ? `${p.votes.length} voted` : resultLine(p, resultOf(p))
                }
                onClick={() => openPoll(p.id)}
              />
            ))}
          </ListGroup>
        </>
      )}
      {!item.archivedAt && (
        <button
          type="button"
          className="flex min-h-11 items-center gap-1 justify-self-start text-sm font-extrabold text-accent-ink"
          onClick={() => newPoll({ id: item.id, title: item.title })}
        >
          <Plus aria-hidden className="size-4" /> Poll about this
        </button>
      )}
    </section>
  )
}
