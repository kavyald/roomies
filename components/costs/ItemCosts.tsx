'use client'

import { Receipt } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Disclosure } from '@/components/ui/Disclosure'
import { useToast } from '@/components/ui/Toast'
import { useAddCost, useCosts } from '@/lib/client/hooks'
import type { HouseId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
import { formatCents, sumCents } from '@/lib/domain/money'
import { useCostFields } from './CostForm'
import { CostRows } from './CostRows'
import { useSplitwise } from './useSplitwise'

/**
 * "Costs · $189.00" on an item: a closed section with each cost ("$189 · Wren paid", with Open
 * Splitwise and Edit / Remove in its "…" menu) and **Add cost** (FRONTEND §5.4).
 */
export function ItemCosts({ houseId, item }: { houseId: HouseId; item: Item }) {
  const costs = useCosts(houseId)
  const add = useAddCost(houseId)
  const toast = useToast()
  const splitwise = useSplitwise(houseId)
  const form = useCostFields(houseId, 'item-cost')
  const [adding, setAdding] = useState(false)
  const mine = (costs.data ?? []).filter((c) => c.for && 'item' in c.for && c.for.item === item.id)

  const total = sumCents(mine.map((c) => c.amount))

  return (
    <Disclosure title="Costs" summary={mine.length > 0 ? formatCents(total) : undefined}>
      <CostRows houseId={houseId} costs={mine} title={item.title} />
      {adding ? (
        <div className="grid gap-2 rounded-2xl bg-paper p-3">
          {form.fields}
          <Button
            disabled={add.isPending || !form.valid}
            onClick={async () => {
              const v = form.value()
              if (!v) return
              const r = await add.mutateAsync({ ...v, itemId: item.id })
              if (!r.ok) return toast("Couldn't add the cost. Try again.")
              toast(`Added ${formatCents(r.value.amount)}.`, {
                label: 'Open Splitwise',
                onClick: () => splitwise(r.value, item.title),
              })
              form.reset()
              setAdding(false)
            }}
          >
            Save cost
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="flex min-h-11 items-center gap-1 justify-self-start text-sm font-extrabold text-accent-ink"
          onClick={() => setAdding(true)}
        >
          <Receipt aria-hidden className="size-4" /> Add cost
        </button>
      )}
    </Disclosure>
  )
}
