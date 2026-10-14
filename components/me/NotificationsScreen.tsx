'use client'

import { useProfiles } from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import type { HouseId } from '@/lib/domain/ids'
import { DEFAULT_QUIET_HOURS } from '@/lib/domain/notifications'
import { NotificationsSection } from './NotificationsSection'

/** Your notifications (FRONTEND §5.11): this device, the six categories and quiet hours. */
export function NotificationsScreen({ houseId }: { houseId: HouseId }) {
  const { me } = useAppClient()
  const profiles = useProfiles(houseId)
  const mine = profiles.data?.find((p) => p.id === me)
  if (!mine) return <p className="text-ink-soft">Loading…</p>
  return <NotificationsSection houseId={houseId} quiet={mine.quietHours ?? DEFAULT_QUIET_HOURS} />
}
