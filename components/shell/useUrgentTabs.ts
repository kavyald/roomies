'use client'

import { useItems, useRanking, useRooms, useRoutines } from '@/lib/client/hooks'
import type { HouseId } from '@/lib/domain/ids'
import type { Category } from '@/lib/domain/items'
import { urgentTabs } from '@/lib/domain/lists'

const NONE: ReadonlySet<Category> = new Set()

/** The kinds whose tab gets a dot: something open on it is Urgent (T108, `urgentTabs`). */
export const useUrgentTabs = (houseId: HouseId): ReadonlySet<Category> => {
  const items = useItems(houseId)
  const rooms = useRooms(houseId)
  const routines = useRoutines(houseId)
  const ranking = useRanking(houseId)
  if (!items.data) return NONE
  return urgentTabs(items.data, {
    ...ranking,
    rooms: rooms.data ?? [],
    routines: routines.data ?? [],
  })
}
