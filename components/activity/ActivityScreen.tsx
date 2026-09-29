'use client'

import { History } from 'lucide-react'
import { useMemo } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  useActivity,
  useContacts,
  useHouse,
  useIsAdmin,
  useMembers,
  useProfiles,
  useRooms,
} from '@/lib/client/hooks'
import { activityFeed, type ActivityNames } from '@/lib/domain/activity'
import { relativeTime } from '@/lib/domain/format'
import type { HouseId } from '@/lib/domain/ids'
import { useNow } from '@/lib/client/use-now'

/** Everything that happened in the house, newest first, one line per action (PRD §9). */
export function ActivityScreen({ houseId }: { houseId: HouseId }) {
  const activity = useActivity(houseId)
  const house = useHouse(houseId)
  const profiles = useProfiles(houseId)
  const members = useMembers(houseId)
  const contacts = useContacts(houseId)
  const rooms = useRooms(houseId)
  const isAdmin = useIsAdmin(houseId)
  const now = useNow()

  const names = useMemo<ActivityNames>(() => {
    const people = new Map((profiles.data ?? []).map((p) => [p.id as string, p.displayName]))
    const contactNames = new Map((contacts.data ?? []).map((c) => [c.id as string, c.name]))
    const roomNames = new Map((rooms.data ?? []).map((r) => [r.id as string, r.name]))
    return {
      person: (id) => people.get(id),
      contact: (id) => contactNames.get(id),
      room: (id) => roomNames.get(id),
    }
  }, [profiles.data, contacts.data, rooms.data])

  const elementOf = useMemo(() => {
    const roomById = new Map((rooms.data ?? []).map((r) => [r.id as string, r]))
    return new Map(
      (members.data ?? []).map((m) => [
        m.userId as string,
        m.roomId ? roomById.get(m.roomId)?.element : undefined,
      ]),
    )
  }, [members.data, rooms.data])

  if (activity.isError) {
    return (
      <p role="alert" className="font-bold text-ink-soft">
        Couldn&apos;t reach the house. Check your connection and try again.
      </p>
    )
  }
  if (activity.isPending) return <p className="text-ink-soft">Loading…</p>

  const rows = activity.data.pages.flatMap((p) => p.rows)
  const lines = activityFeed(rows, names, { isAdmin })
  const tz = house.data?.settings.timezone ?? 'UTC'

  if (lines.length === 0) {
    return <EmptyState icon={History}>Nothing has happened yet. It all starts here.</EmptyState>
  }

  return (
    <>
      <ol aria-label="Activity" className="m-0 grid list-none gap-3 p-0">
        {lines.map((line) => {
          const who = line.actorId ? names.person(line.actorId) : undefined
          return (
            <li key={line.actionId} className="flex items-start gap-3">
              <Avatar
                name={who ?? 'Roomies'}
                element={line.actorId ? elementOf.get(line.actorId) : undefined}
              />
              <div className="min-w-0 flex-1">
                <p className="m-0 leading-snug font-semibold">{line.text}</p>
                <p className="m-0 text-[0.8rem] font-semibold text-ink-soft">
                  {relativeTime(line.at, now, tz)}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
      {activity.hasNextPage && (
        <div className="mt-5">
          <Button
            variant="secondary"
            block
            disabled={activity.isFetchingNextPage}
            onClick={() => activity.fetchNextPage()}
          >
            Show earlier
          </Button>
        </div>
      )}
    </>
  )
}
