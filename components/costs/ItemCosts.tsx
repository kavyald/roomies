'use client'

import { Receipt } from 'lucide-react'
import { useState } from 'react'
import { useCardContext } from '@/components/items/useCardContext'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useAddCost, useCosts } from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import type { HouseId } from '@/lib/domain/ids'
import type { Item } from '@/lib/domain/items'
import { formatCents } from '@/lib/domain/money'
import { useCostFields } from './CostForm'
import { useSplitwise } from './useSplitwise'

/** Costs on an item ("$189 · Wren paid") and **Add cost** (FRONTEND §5.4). */
export function ItemCosts({ houseId, item }: { houseId: HouseId; item: Item }) {
  const { me } = useAppClient()
  const costs = useCosts(houseId)
  const add = useAddCost(houseId)
  const ctx = useCardContext(houseId)
  const toast = useToast()
  const splitwise = useSplitwise(houseId)
  const form = useCostFields(houseId, 'item-cost')
  const [adding, setAdding] = useState(false)
  const mine = (costs.data ?? []).filter((c) => c.for && 'item' in c.for && c.for.item === item.id)

  return (
    <section aria-label="Costs" className="grid gap-2">
      {mine.length > 0 && (
        <>
          <h3 className="m-0 text-[0.8rem] font-extrabold tracking-[.06em] text-ink-soft uppercase">
            Costs
          </h3>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {mine.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <Receipt aria-hidden className="size-4 text-ink-soft" />
                <span className="flex-1 font-bold">
                  {formatCents(c.amount)} ·{' '}
                  {c.paidBy === me ? 'You paid' : `${ctx.person(c.paidBy)?.name ?? 'Someone'} paid`}
                  {c.note && <span className="font-semibold text-ink-soft"> · {c.note}</span>}
                </span>
                <button
                  type="button"
                  className="min-h-11 text-sm font-extrabold text-accent-ink"
                  onClick={() => splitwise(c, item.title)}
                >
                  Open Splitwise
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
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
    </section>
  )
}
