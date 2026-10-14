'use client'

import { CATEGORY } from '@/components/items/meta'
import { useCardContext } from '@/components/items/useCardContext'
import { RUN_ICON } from '@/components/runs/meta'
import { useItemSheets } from '@/components/items/ItemSheets'
import type { CalendarEntry } from '@/lib/domain/calendar'
import type { HouseId } from '@/lib/domain/ids'

/** A calendar entry's title, icon, and what tapping it opens. */
export const useEntryView = (houseId: HouseId) => {
  const ctx = useCardContext(houseId)
  const { openItem, openRun } = useItemSheets()
  return (e: CalendarEntry) =>
    e.kind === 'item'
      ? {
          key: `i-${e.item.id}`,
          title: e.item.title,
          icon: CATEGORY[e.item.category].icon,
          open: () => openItem(e.item.id),
        }
      : {
          key: `r-${e.run.id}`,
          title: ctx.run(e.run.id)?.label ?? 'Run',
          icon: RUN_ICON[e.run.kind],
          open: () => openRun(e.run.id),
        }
}
