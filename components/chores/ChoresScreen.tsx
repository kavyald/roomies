'use client'

import { Sparkles } from 'lucide-react'
import { useItemSheets } from '@/components/items/ItemSheets'
import { choreMeta } from '@/components/items/meta'
import { ItemCard } from '@/components/items/ItemCard'
import { useCardContext } from '@/components/items/useCardContext'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useCelebrate, useToast } from '@/components/ui/Toast'
import { useDoChore, useHouse, useItems, useFeelingsByItem } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import type { HouseId } from '@/lib/domain/ids'
import { choreList } from '@/lib/domain/lists'

/** Chores (FRONTEND §5.6): furthest past their rhythm first, with one-tap Did it. */
export function ChoresScreen({ houseId }: { houseId: HouseId }) {
  const items = useItems(houseId)
  const house = useHouse(houseId)
  const ctx = useCardContext(houseId)
  const feelingsBy = useFeelingsByItem(houseId)
  const { openItem, openAdd } = useItemSheets()
  const did = useDoChore(houseId)
  const toast = useToast()
  const celebrate = useCelebrate()
  const now = useNow()

  if (items.isError) {
    return (
      <p role="alert" className="font-bold text-ink-soft">
        Couldn&apos;t reach the house. Check your connection and try again.
      </p>
    )
  }
  if (items.isPending) return <p className="text-ink-soft">Loading…</p>

  const tz = house.data?.settings.timezone ?? 'UTC'
  const chores = choreList(items.data, now, tz)
  if (chores.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        action={
          <Button size="small" onClick={() => openAdd('chore')}>
            Add a chore
          </Button>
        }
      >
        Nothing to do. Enjoy the quiet.
      </EmptyState>
    )
  }

  return (
    <ul aria-label="Chores" className="m-0 grid list-none gap-3 p-0">
      {chores.map((c) => (
        <li key={c.id}>
          <ItemCard
            item={c}
            ctx={ctx}
            feelings={feelingsBy.get(c.id)}
            meta={choreMeta(c, now, tz, (u) => ctx.person(u)?.name)}
            onOpen={() => openItem(c.id)}
            checkLabel={`Did it: ${c.title}`}
            onCheck={async () => {
              const r = await did.mutateAsync(c.id)
              if (r.ok) celebrate()
              toast(r.ok ? 'Did it. Thanks! 💛' : "Couldn't record that. Try again.")
            }}
          />
        </li>
      ))}
    </ul>
  )
}
