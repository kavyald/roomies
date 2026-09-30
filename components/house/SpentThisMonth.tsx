'use client'

import { Receipt } from 'lucide-react'
import { useCosts, useHouse, useMembers } from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { monthlySpend, monthOf } from '@/lib/domain/costs'
import type { HouseId } from '@/lib/domain/ids'
import { formatCents } from '@/lib/domain/money'

/** "Spent this month: $X · your share $Y" (PRD §6.6), split equally among the house. */
export function SpentThisMonth({ houseId }: { houseId: HouseId }) {
  const costs = useCosts(houseId)
  const members = useMembers(houseId)
  const house = useHouse(houseId)
  const now = useNow()
  if (!house.data || !costs.data) return null
  const tz = house.data.settings.timezone
  const people = (members.data ?? []).filter((m) => m.status.active).length
  const { total, share } = monthlySpend(costs.data, people, monthOf(now, tz), tz)
  return (
    <p
      aria-label="Spent this month"
      className="sticker m-0 flex min-h-11 items-center gap-3 rounded-[20px] border-[1.5px] border-outline bg-card px-3.5 py-3 font-bold"
    >
      <Receipt aria-hidden className="size-5 flex-none text-ink-soft" />
      <span>
        Spent this month: {formatCents(total)}
        <span className="font-semibold text-ink-soft"> · your share {formatCents(share)}</span>
      </span>
    </p>
  )
}
