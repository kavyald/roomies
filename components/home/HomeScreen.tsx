'use client'

import { Heart } from 'lucide-react'
import { useState } from 'react'
import { FeelingCounts } from '@/components/items/Feelings'
import { useItemSheets } from '@/components/items/ItemSheets'
import { ItemCard } from '@/components/items/ItemCard'
import { itemMeta } from '@/components/items/meta'
import { useCardContext } from '@/components/items/useCardContext'
import { TierChip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useCelebrate, useToast } from '@/components/ui/Toast'
import {
  useDoChore,
  useFeelingsByItem,
  useHouse,
  useItems,
  useMarkDone,
  useReopenItem,
  useRuns,
} from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import { useNow } from '@/lib/client/use-now'
import type { HouseId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
import { homeFeed, type FeedFilter } from '@/lib/domain/priority'
import { visitDateOf } from '@/lib/domain/runs'
import { ComingUp } from './ComingUp'
import { OpenPolls } from './OpenPolls'
import { RunsInProgress } from './RunsInProgress'
import { WeightsChangedCard } from './WeightsChangedCard'

const EMPTY: Record<FeedFilter, string> = {
  all: 'Nothing needs attention right now. Enjoy the quiet.',
  mine: "Nothing's on you right now.",
}

const CHECK: Record<Item['category'], string> = { need: 'Got it', task: 'Done', chore: 'Did it' }

/**
 * Home (FRONTEND §5.1): Needs attention, ranked by priority (PRD §8.1). Coming up, polls and runs
 * join in M3.
 */
export function HomeScreen({ houseId }: { houseId: HouseId }) {
  const { me } = useAppClient()
  const items = useItems(houseId)
  const runs = useRuns(houseId)
  const house = useHouse(houseId)
  const ctx = useCardContext(houseId)
  const feelingsBy = useFeelingsByItem(houseId)
  const { openItem } = useItemSheets()
  const done = useMarkDone(houseId)
  const reopen = useReopenItem(houseId)
  const did = useDoChore(houseId)
  const toast = useToast()
  const celebrate = useCelebrate()
  const now = useNow()
  const [filter, setFilter] = useState<FeedFilter>('all')

  if (items.isError) {
    return (
      <p role="alert" className="font-bold text-ink-soft">
        Couldn&apos;t reach the house. Check your connection and try again.
      </p>
    )
  }
  if (items.isPending || !house.data) return <p className="text-ink-soft">Loading…</p>

  const { timezone: tz, feelingWeights: weights } = house.data.settings
  const runsById = new Map((runs.data ?? []).map((r) => [r.id as string, r]))
  const feed = homeFeed(items.data, (i) => feelingsBy.get(i.id) ?? [], {
    weights,
    now,
    tz,
    filter,
    me,
    visitDate: (i) => visitDateOf(i, runsById),
  })

  const check = async (item: Item) => {
    if (item.category === 'chore') {
      const r = await did.mutateAsync(item.id)
      if (r.ok) celebrate()
      return toast(r.ok ? 'Did it. Thanks! 💛' : "Couldn't record that. Try again.")
    }
    const r = await done.mutateAsync(item.id)
    if (r.ok) celebrate()
    toast(
      r.ok
        ? item.category === 'need'
          ? 'Got it. 💛'
          : 'Done. 💛'
        : "Couldn't check it off. Try again.",
      r.ok ? { label: 'Undo', onClick: () => reopen.mutate(item.id) } : undefined,
    )
  }

  return (
    <div className="grid gap-4">
      <WeightsChangedCard houseId={houseId} />
      <ComingUp houseId={houseId} />
      <OpenPolls houseId={houseId} />
      <RunsInProgress houseId={houseId} />
      <section aria-labelledby="needs-attention" className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="needs-attention" className="m-0 text-lg font-extrabold">
            Needs attention
          </h2>
          <SegmentedControl
            label="Whose items"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'mine', label: 'Mine' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        {feed.length === 0 ? (
          <EmptyState icon={Heart}>{EMPTY[filter]}</EmptyState>
        ) : (
          <ul aria-label="Needs attention" className="m-0 grid list-none gap-3 p-0">
            {feed.map(({ item, tier }) => {
              const feelings = feelingsBy.get(item.id)
              return (
                <li key={item.id}>
                  <ItemCard
                    item={item}
                    ctx={ctx}
                    top={
                      <span className="flex items-center justify-between gap-2">
                        <TierChip tier={tier} />
                        {feelings?.length ? <FeelingCounts feelings={feelings} /> : null}
                      </span>
                    }
                    meta={itemMeta(item, now, tz, (u) => ctx.person(u)?.name)}
                    onOpen={() => openItem(item.id)}
                    checkLabel={`${CHECK[item.category]}: ${item.title}`}
                    onCheck={() => check(item)}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
