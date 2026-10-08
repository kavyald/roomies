'use client'

import { useCardContext } from '@/components/items/useCardContext'
import { Avatar } from '@/components/ui/Avatar'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useToast } from '@/components/ui/Toast'
import { useProfiles, useUpdateMySettings } from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import type { Theme } from '@/lib/domain/house'
import type { HouseId } from '@/lib/domain/ids'
import { DEFAULT_QUIET_HOURS } from '@/lib/domain/notifications'
import { NotificationsSection } from './NotificationsSection'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-6 mb-2.5 text-[1.0625rem] font-extrabold">{children}</h2>
}

/** Personal settings (FRONTEND §5.11, PRD §11): notifications in one section, and theme. */
export function MeScreen({ houseId }: { houseId: HouseId }) {
  const { me } = useAppClient()
  const profiles = useProfiles(houseId)
  const update = useUpdateMySettings(houseId)
  const ctx = useCardContext(houseId)
  const toast = useToast()
  const mine = profiles.data?.find((p) => p.id === me)

  if (!mine) return <p className="text-ink-soft">Loading…</p>
  const person = ctx.person(me)

  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={mine.displayName} element={person?.element} size={48} />
        <p className="m-0 text-lg font-extrabold">{mine.displayName}</p>
      </div>

      <SectionTitle>Notifications</SectionTitle>
      <NotificationsSection houseId={houseId} quiet={mine.quietHours ?? DEFAULT_QUIET_HOURS} />

      <SectionTitle>Appearance</SectionTitle>
      <SegmentedControl
        label="Theme"
        wide
        value={mine.theme}
        onChange={async (theme: Theme) => {
          const r = await update.mutateAsync({ theme })
          if (!r.ok && r.error !== 'no_change') toast("Couldn't change the theme. Try again.")
        }}
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    </>
  )
}
