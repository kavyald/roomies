'use client'

import Link from 'next/link'
import { useCardContext } from '@/components/items/useCardContext'
import { Avatar } from '@/components/ui/Avatar'
import { useAppClient } from '@/lib/client/provider'
import type { HouseId } from '@/lib/domain/ids'

/** Your avatar in the Home header: personal settings (FRONTEND §5.1). */
export function MeLink({ houseId }: { houseId: HouseId }) {
  const { me } = useAppClient()
  const ctx = useCardContext(houseId)
  const person = ctx.person(me)
  return (
    <Link
      href={`/h/${houseId}/me`}
      aria-label="Your settings"
      className="grid size-11 place-items-center rounded-full"
    >
      <Avatar name={person?.name ?? 'You'} element={person?.element} size={32} />
    </Link>
  )
}
