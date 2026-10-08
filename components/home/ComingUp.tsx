'use client'

import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useEntryView } from '@/components/calendar/useEntryLabel'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { useHouse, useItems, useRuns } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { comingUp } from '@/lib/domain/calendar'
import { describeWhen } from '@/lib/domain/format'
import type { HouseId } from '@/lib/domain/ids'
import { localDateOf } from '@/lib/domain/time'

/** Home's "Coming up" (FRONTEND §5.1): the next 7 days of dated tasks, needs, and runs. */
export function ComingUp({ houseId }: { houseId: HouseId }) {
  const items = useItems(houseId)
  const runs = useRuns(houseId)
  const house = useHouse(houseId)
  const now = useNow()
  const view = useEntryView(houseId)
  if (!house.data || !items.data || !runs.data) return null
  const tz = house.data.settings.timezone
  const entries = comingUp(items.data, runs.data, localDateOf(now, tz))
  return (
    <section aria-labelledby="coming-up" className="grid gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="coming-up" className="m-0 text-lg font-extrabold">
          Coming up
        </h2>
        <Link
          href={`/h/${houseId}/calendar`}
          className="flex min-h-11 items-center gap-0.5 text-sm font-extrabold text-accent-ink"
        >
          All <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="m-0 text-sm text-ink-soft">Nothing with a date this week.</p>
      ) : (
        <ListGroup label="Coming up">
          {entries.map((e) => {
            const v = view(e)
            return (
              <ListRow
                key={v.key}
                leading={<v.icon aria-hidden className="size-5 text-ink-soft" />}
                title={v.title}
                subtitle={describeWhen(e.when, now, tz)}
                onClick={v.open}
              />
            )
          })}
        </ListGroup>
      )}
    </section>
  )
}
