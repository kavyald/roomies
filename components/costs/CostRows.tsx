'use client'

import { Receipt } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useCardContext } from '@/components/items/useCardContext'
import { Button } from '@/components/ui/Button'
import { OverflowMenu } from '@/components/ui/OverflowMenu'
import { useToast } from '@/components/ui/Toast'
import { useEditCost, useRemoveCost } from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import type { Cost } from '@/lib/domain/costs'
import type { HouseId } from '@/lib/domain/ids'
import { formatCents } from '@/lib/domain/money'
import { useCostFields } from './CostForm'
import { useSplitwise } from './useSplitwise'

/**
 * Costs as rows ("$189.00 · Wren paid · Dyson"), each with Open Splitwise and a "…" menu to edit
 * or remove it (T57). `title` is what Splitwise's line is named after (the item or run).
 */
export function CostRows({
  houseId,
  costs,
  title,
}: {
  houseId: HouseId
  costs: readonly Cost[]
  title: string
}) {
  if (costs.length === 0) return null
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {costs.map((c) => (
        <CostRow key={c.id} houseId={houseId} cost={c} title={title} />
      ))}
    </ul>
  )
}

function CostRow({ houseId, cost, title }: { houseId: HouseId; cost: Cost; title: string }) {
  const { me } = useAppClient()
  const ctx = useCardContext(houseId)
  const splitwise = useSplitwise(houseId)
  const [mode, setMode] = useState<'view' | 'edit' | 'remove'>('view')
  const amount = formatCents(cost.amount)
  const payer =
    cost.paidBy === me ? 'You paid' : `${ctx.person(cost.paidBy)?.name ?? 'Someone'} paid`

  return (
    <li className="grid gap-2">
      <div className="flex items-center gap-2 text-sm">
        <Receipt aria-hidden className="size-4 flex-none text-ink-soft" />
        <span className="min-w-0 flex-1 font-bold">
          {amount} · {payer}
          {cost.note && <span className="font-semibold text-ink-soft"> · {cost.note}</span>}
        </span>
        <button
          type="button"
          className="min-h-11 text-sm font-extrabold text-accent-ink"
          onClick={() => splitwise(cost, title)}
        >
          Open Splitwise
        </button>
        <OverflowMenu
          label={`More for ${amount}`}
          items={[
            { label: 'Edit', onSelect: () => setMode('edit') },
            { label: 'Remove', tone: 'soft', onSelect: () => setMode('remove') },
          ]}
        />
      </div>
      {mode === 'edit' && <EditCost houseId={houseId} cost={cost} onDone={() => setMode('view')} />}
      {mode === 'remove' && (
        <RemoveCost houseId={houseId} cost={cost} onDone={() => setMode('view')} />
      )}
    </li>
  )
}

/** The add form's fields, starting from the cost as it is. */
function EditCost({ houseId, cost, onDone }: { houseId: HouseId; cost: Cost; onDone: () => void }) {
  const edit = useEditCost(houseId)
  const toast = useToast()
  const form = useCostFields(houseId, `edit-cost-${cost.id}`, {
    amount: cost.amount,
    paidBy: cost.paidBy,
    ...(cost.note && { note: cost.note }),
  })
  return (
    <div role="group" aria-label="Edit cost" className="grid gap-2 rounded-2xl bg-paper p-3">
      {form.fields}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={edit.isPending} onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={edit.isPending || !form.valid}
          onClick={async () => {
            const v = form.value()
            if (!v) return
            const r = await edit.mutateAsync({
              costId: cost.id,
              amount: v.amount,
              paidBy: v.paidBy,
              note: v.note ?? null,
            })
            if (!r.ok && r.error !== 'no_change') return toast("Couldn't save that. Try again.")
            if (r.ok) toast('Saved.')
            onDone()
          }}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

/** "Remove this cost?" No undo: the history keeps it, and it stops counting. */
function RemoveCost({
  houseId,
  cost,
  onDone,
}: {
  houseId: HouseId
  cost: Cost
  onDone: () => void
}) {
  const remove = useRemoveCost(houseId)
  const toast = useToast()
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus(), [])
  const amount = formatCents(cost.amount)
  return (
    <div
      role="group"
      aria-label="Remove this cost?"
      className="grid gap-2 rounded-2xl bg-paper p-3.5"
    >
      <p className="m-0 font-semibold">
        Remove this cost? {amount} stops counting toward Spent this month.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button ref={first} variant="secondary" disabled={remove.isPending} onClick={onDone}>
          Keep it
        </Button>
        <Button
          disabled={remove.isPending}
          onClick={async () => {
            const r = await remove.mutateAsync({ costId: cost.id })
            if (!r.ok) return toast("Couldn't remove it. Try again.")
            toast(`Removed ${amount}.`)
          }}
        >
          Remove
        </Button>
      </div>
    </div>
  )
}
