'use client'

import { Plus } from 'lucide-react'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { TabBar } from '@/components/ui/TabBar'
import { InstallGuide } from './InstallGuide'
import { NotificationsPrompt } from './NotificationsPrompt'
import { useItemSheets } from '@/components/items/ItemSheets'
import { addKindFor, houseTabs } from './tabs'
import { useUrgentTabs } from './useUrgentTabs'
import type { HouseId } from '@/lib/domain/ids'

/**
 * The signed-in frame: safe-area padding, the 4-tab bar, the + (on Needs, Tasks and Chores only,
 * T107), the install nudge and the notifications prompt.
 */
export function AppShell({
  houseId,
  base,
  children,
}: {
  houseId: HouseId
  base: string
  children: ReactNode
}) {
  const pathname = usePathname()
  const tabs = houseTabs(base, useUrgentTabs(houseId))
  const { openAdd } = useItemSheets()
  // The deepest tab whose href starts the path (House is the base itself, so Activity, Calendar
  // and You sit under it).
  const current =
    [...tabs]
      .sort((a, b) => b.href.length - a.href.length)
      .find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? base
  // On Needs, Chores and Tasks the + goes straight to that kind's form; elsewhere there's none.
  const addKind = addKindFor(base, current)

  // Onboarding (T110) comes before the app: no tabs, no +, and it asks about notifications itself.
  if (pathname === `${base}/welcome`)
    return (
      <div className="mx-auto min-h-dvh max-w-[430px] px-4 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
        {children}
      </div>
    )

  return (
    <div className="mx-auto min-h-dvh max-w-[430px] px-4 pt-[max(12px,env(safe-area-inset-top))] pb-[calc(160px+env(safe-area-inset-bottom))]">
      {children}
      {addKind && (
        <button
          type="button"
          aria-label="Add"
          onClick={() => openAdd(addKind)}
          className="sticker fixed right-[max(18px,calc((100vw-430px)/2+18px))] bottom-[calc(84px+env(safe-area-inset-bottom))] z-30 grid size-[60px] place-items-center rounded-full bg-accent text-on-accent [--sticker-edge:color-mix(in_srgb,var(--accent)_60%,#000)]"
        >
          <Plus aria-hidden className="size-7" strokeWidth={2.5} />
        </button>
      )}
      <TabBar tabs={tabs} current={current} />
      <InstallGuide />
      <NotificationsPrompt />
    </div>
  )
}
