'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { ItemId } from '@/lib/domain/ids'
import { useItemSheets } from './ItemSheets'

/** A link straight to an item (from a notification) opens its sheet over Home. */
export function OpenItem({ base, itemId }: { base: string; itemId: ItemId }) {
  const { openItem } = useItemSheets()
  const router = useRouter()
  useEffect(() => {
    openItem(itemId)
    router.replace(base)
  }, [base, itemId, openItem, router])
  return null
}
