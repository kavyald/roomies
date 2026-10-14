'use client'

import { SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useHouse, useLatestWeightsChange, useProfiles } from '@/lib/client/hooks'
import { useAppClient } from '@/lib/client/provider'
import { useNow } from '@/lib/client/use-now'
import type { FieldChanges } from '@/lib/domain/events'
import { relativeTime } from '@/lib/domain/format'
import type { HouseId } from '@/lib/domain/ids'
import { MS_PER_DAY } from '@/lib/domain/time'
import { describeWeightsChange } from '@/lib/domain/weights'

const SHOW_FOR_MS = 3 * MS_PER_DAY
const DISMISSED = 'roomies.weights-card.dismissed'

// Which card this viewer closed: a per-device convenience, so storage failures just show it again.
const readDismissed = (): number | null => {
  try {
    const v = localStorage.getItem(DISMISSED)
    return v ? Number(v) : null
  } catch {
    return null
  }
}
const writeDismissed = (id: number) => {
  try {
    localStorage.setItem(DISMISSED, String(id))
  } catch {
    // Nothing to do: the card just comes back next time.
  }
}

/** "Maya set 😰 Anxious to +30" on Home for a few days after the weights change (PRD §8.2). */
export function WeightsChangedCard({ houseId }: { houseId: HouseId }) {
  const { me } = useAppClient()
  const latest = useLatestWeightsChange(houseId)
  const profiles = useProfiles(houseId)
  const house = useHouse(houseId)
  const now = useNow()
  const [dismissed, setDismissed] = useState<number | null>(null)
  useEffect(() => {
    // Read after mount: the server can't see this device's storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(readDismissed())
  }, [])

  const row = latest.data
  if (!row || !house.data || row.id === dismissed) return null
  if (now.epochMs - row.at.epochMs > SHOW_FOR_MS) return null

  const who =
    row.actorId === me
      ? 'You'
      : (profiles.data?.find((p) => p.id === row.actorId)?.displayName ?? 'A former roommate')
  return (
    <aside
      aria-label="Feeling weights changed"
      className="sticker flex items-start gap-3 rounded-[20px] border-[1.5px] border-outline bg-card py-3 pr-1.5 pl-3.5"
    >
      <SlidersHorizontal aria-hidden className="mt-0.5 size-5 flex-none text-accent-ink" />
      <p className="m-0 min-w-0 flex-1 leading-snug">
        <span className="font-bold">
          {who} {describeWeightsChange(row.changes as FieldChanges | undefined)}
        </span>
        <span className="block text-[0.8rem] font-semibold text-ink-soft">
          The feed is re-ranked for everyone ·{' '}
          {relativeTime(row.at, now, house.data.settings.timezone)}
        </span>
      </p>
      <button
        type="button"
        aria-label="Hide this"
        className="grid size-11 flex-none place-items-center rounded-full text-ink-soft"
        onClick={() => {
          writeDismissed(row.id)
          setDismissed(row.id)
        }}
      >
        <X aria-hidden className="size-4" />
      </button>
    </aside>
  )
}
