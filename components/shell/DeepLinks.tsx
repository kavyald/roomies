'use client'

import { BarChart3, ShoppingCart, WifiOff, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect } from 'react'
import { useItemSheets } from '@/components/items/ItemSheets'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePolls, useRuns } from '@/lib/client/hooks'
import type { HouseId, PollId, RunId } from '@/lib/domain/ids'
import { ScreenHeader } from './ScreenHeader'

type Listing = { readonly data?: readonly { readonly id: string }[]; readonly isError: boolean }

/**
 * Once the house's list has loaded: if `id` is in it, open its sheet and move to Home underneath
 * (like OpenItem); otherwise say it isn't there.
 */
const useOpenWhenFound = (
  list: Listing,
  id: string,
  open: () => void,
  base: string,
): 'loading' | 'found' | 'missing' | 'offline' => {
  const router = useRouter()
  const found = list.data?.some((x) => x.id === id) ?? false
  useEffect(() => {
    if (!found) return
    open()
    router.replace(base)
  }, [found, open, base, router])
  if (found) return 'found'
  if (list.data) return 'missing'
  return list.isError ? 'offline' : 'loading'
}

function NotThere({
  title,
  icon,
  base,
  offline,
  children,
}: {
  title: string
  icon: LucideIcon
  base: string
  offline: boolean
  children: string
}) {
  return (
    <main>
      <ScreenHeader title={title} />
      <EmptyState
        icon={offline ? WifiOff : icon}
        action={
          <Link
            href={base}
            className="sticker inline-flex min-h-11 items-center justify-center rounded-full bg-neutral-fill px-3.5 py-2 text-sm font-extrabold text-neutral-ink"
          >
            Go to Home
          </Link>
        }
      >
        {offline ? "Couldn't reach the house. Check your connection and try again." : children}
      </EmptyState>
    </main>
  )
}

/** A link straight to a poll (from a notification) opens its sheet over Home. */
export function OpenPoll({ houseId, pollId }: { houseId: HouseId; pollId: PollId }) {
  const { openPoll } = useItemSheets()
  const base = `/h/${houseId}`
  const open = useCallback(() => openPoll(pollId), [openPoll, pollId])
  const state = useOpenWhenFound(usePolls(houseId), pollId, open, base)
  if (state !== 'missing' && state !== 'offline') return null
  return (
    <NotThere title="Poll" icon={BarChart3} base={base} offline={state === 'offline'}>
      We couldn&apos;t find that poll. It may have been removed.
    </NotThere>
  )
}

/** A link straight to a run, request or visit (from a notification) opens its sheet over Home. */
export function OpenRun({ houseId, runId }: { houseId: HouseId; runId: RunId }) {
  const { openRun } = useItemSheets()
  const base = `/h/${houseId}`
  const open = useCallback(() => openRun(runId), [openRun, runId])
  const state = useOpenWhenFound(useRuns(houseId), runId, open, base)
  if (state !== 'missing' && state !== 'offline') return null
  return (
    <NotThere title="Run" icon={ShoppingCart} base={base} offline={state === 'offline'}>
      We couldn&apos;t find that run. It may have been removed.
    </NotThere>
  )
}
