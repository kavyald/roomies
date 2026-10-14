'use client'

import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useToast } from '@/components/ui/Toast'
import { useProfiles, useUpdateMySettings } from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import type { Theme } from '@/lib/domain/house'
import type { HouseId } from '@/lib/domain/ids'
import { THEMES, THEME_LABEL } from './theme'

/** Appearance (FRONTEND §5.11, T65): the theme, on its own page apart from notifications. */
export function AppearanceScreen({ houseId }: { houseId: HouseId }) {
  const { me } = useAppClient()
  const profiles = useProfiles(houseId)
  const update = useUpdateMySettings(houseId)
  const toast = useToast()
  const mine = profiles.data?.find((p) => p.id === me)
  if (!mine) return <p className="text-ink-soft">Loading…</p>

  return (
    <>
      <SegmentedControl
        label="Theme"
        wide
        value={mine.theme}
        onChange={async (theme: Theme) => {
          const r = await update.mutateAsync({ theme })
          if (!r.ok && r.error !== 'no_change') toast("Couldn't change the theme. Try again.")
        }}
        options={THEMES.map((value) => ({ value, label: THEME_LABEL[value] }))}
      />
      <p className="mt-2.5 text-[0.8125rem] text-ink-soft">
        Auto follows your phone. This only changes how Roomies looks for you.
      </p>
    </>
  )
}
