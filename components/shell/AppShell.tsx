'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { TabBar } from '@/components/ui/TabBar'
import { InstallGuide } from './InstallGuide'
import { houseTabs } from './tabs'

/** The signed-in frame: safe-area padding, the 5-tab bar, and the install nudge. */
export function AppShell({ base, children }: { base: string; children: ReactNode }) {
  const pathname = usePathname()
  const tabs = houseTabs(base)
  // The deepest tab whose href starts the path (Home is the base itself).
  const current =
    [...tabs]
      .sort((a, b) => b.href.length - a.href.length)
      .find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? base

  return (
    <div className="mx-auto min-h-dvh max-w-[430px] px-4 pt-[max(12px,env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))]">
      {children}
      <TabBar tabs={tabs} current={current} />
      <InstallGuide />
    </div>
  )
}
