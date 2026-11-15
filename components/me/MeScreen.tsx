'use client'

import { Bell, ChevronRight, SunMoon } from 'lucide-react'
import Link from 'next/link'
import { FeedbackRow } from '@/components/house/FeedbackSheet'
import { useCardContext } from '@/components/items/useCardContext'
import { Avatar } from '@/components/ui/Avatar'
import { useProfiles } from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import type { HouseId } from '@/lib/domain/ids'
import { THEME_LABEL } from './theme'
import { YourRoom } from './YourRoom'

function SettingsLink({
  href,
  icon,
  title,
  value,
}: {
  href: string
  icon: React.ReactNode
  title: string
  value?: string
}) {
  return (
    <Link
      href={href}
      className="sticker flex min-h-11 items-center gap-3 rounded-[20px] border-[1.5px] border-outline bg-card px-3.5 py-3 font-bold"
    >
      {icon}
      <span className="flex-1">{title}</span>
      {value && <span className="font-semibold text-ink-soft">{value}</span>}
      <ChevronRight aria-hidden className="size-5 text-ink-soft" />
    </Link>
  )
}

/**
 * You (FRONTEND §5.11, PRD §11, T109): everything that's yours, not the house's. Your name and
 * avatar, your room, Notifications and Appearance (each its own page, T65, so the theme never
 * reads as a notification setting), and feedback to the owner. The page adds Sign out and Delete my account below.
 */
export function MeScreen({ houseId }: { houseId: HouseId }) {
  const { me } = useAppClient()
  const profiles = useProfiles(houseId)
  const ctx = useCardContext(houseId)
  const mine = profiles.data?.find((p) => p.id === me)

  if (!mine) return <p className="text-ink-soft">Loading…</p>
  const person = ctx.person(me)

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3">
        <Avatar name={mine.displayName} element={person?.element} size={48} />
        <p className="m-0 text-lg font-extrabold">{mine.displayName}</p>
      </div>

      <YourRoom houseId={houseId} />

      <nav aria-label="Settings" className="grid gap-3">
        <SettingsLink
          href={`/h/${houseId}/me/notifications`}
          icon={<Bell aria-hidden className="size-5 text-ink-soft" />}
          title="Notifications"
        />
        <SettingsLink
          href={`/h/${houseId}/me/appearance`}
          icon={<SunMoon aria-hidden className="size-5 text-ink-soft" />}
          title="Appearance"
          value={THEME_LABEL[mine.theme]}
        />
      </nav>

      <FeedbackRow houseId={houseId} />
    </div>
  )
}
