'use client'

import { useToast } from '@/components/ui/Toast'
import { useCopiedToSplitwise, useHouse } from '@/lib/client/hooks'
import type { Cost } from '@/lib/domain/costs'
import { splitwiseText } from '@/lib/domain/costs'
import type { HouseId } from '@/lib/domain/ids'
import { splitwiseUrl } from '@/lib/domain/splitwise'

/**
 * A cost's Splitwise icon (T89): copies "{title} — $42.50", opens the house's Splitwise group (or
 * Splitwise's home page until one is linked in Admin), and notes it, which highlights the icon.
 * Splitwise has no link that fills in an expense, so the copied line is what you paste.
 *
 * The copy starts and the window opens inside the tap itself, before anything is awaited: iPhone
 * Safari only allows both during the tap.
 */
export const useSplitwise = (houseId: HouseId) => {
  const house = useHouse(houseId)
  const toast = useToast()
  const noted = useCopiedToSplitwise(houseId)
  return (cost: Cost, title: string) => {
    const copied = navigator.clipboard
      ?.writeText(splitwiseText(title, cost.amount))
      .then(() => true)
      .catch(() => false)
    window.open(splitwiseUrl(house.data?.settings ?? {}), '_blank', 'noopener')
    noted.mutate({ costId: cost.id })
    void Promise.resolve(copied).then((ok) =>
      toast(ok ? 'Copied. Paste it into Splitwise.' : 'Couldn’t copy. Type it into Splitwise.'),
    )
  }
}
