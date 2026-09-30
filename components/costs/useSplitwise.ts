'use client'

import { useCopy } from '@/components/house/useCopy'
import { useCopiedToSplitwise } from '@/lib/client/hooks'
import type { Cost } from '@/lib/domain/costs'
import type { HouseId } from '@/lib/domain/ids'
import { splitwiseText } from '@/lib/domain/costs'

const SPLITWISE = 'https://secure.splitwise.com/'

/** "Open Splitwise": copies "{title} — $42.50", notes it, and opens Splitwise (no API in v1). */
export const useSplitwise = (houseId: HouseId) => {
  const copy = useCopy()
  const noted = useCopiedToSplitwise(houseId)
  return async (cost: Cost, title: string) => {
    await copy(splitwiseText(title, cost.amount), 'Copied. Paste it into Splitwise.')
    noted.mutate({ costId: cost.id })
    window.open(SPLITWISE, '_blank', 'noopener')
  }
}
