'use client'

import {
  BarChart3,
  CheckCircle,
  ChevronRight,
  History,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  SquarePlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useItemSheets } from '@/components/items/ItemSheets'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import {
  useActivity,
  useContacts,
  useHouse,
  useIsAdmin,
  useMembers,
  useProfiles,
  useRooms,
} from '@/lib/client/hooks'
import {
  ACTIVITY_FILTERS,
  activityFeed,
  activityNames,
  feedByDay,
  inActivityFilter,
  mergeSubjects,
  type ActivityFilter,
  type FeedLine,
  type FeedTarget,
  type FeedTopic,
} from '@/lib/domain/activity'
import type { HouseId } from '@/lib/domain/ids'
import { useNow } from '@/lib/client/use-now'

/** An icon and a word for what each line is about, so the log scans at a glance. */
const TOPIC: Record<FeedTopic, { icon: LucideIcon; label: string }> = {
  need: { icon: ShoppingBag, label: 'Need' },
  chore: { icon: Sparkles, label: 'Chore' },
  task: { icon: CheckCircle, label: 'Task' },
  item: { icon: SquarePlus, label: 'Items' },
  poll: { icon: BarChart3, label: 'Poll' },
  run: { icon: ShoppingCart, label: 'Run' },
  money: { icon: Receipt, label: 'Money' },
  house: { icon: Users, label: 'House' },
}

/**
 * Everything that happened in the house, newest first, one line per action, under day headings
 * (PRD §9, T40). A line about an item, run or poll opens its sheet in place.
 */
export function ActivityScreen({ houseId }: { houseId: HouseId }) {
  const activity = useActivity(houseId)
  const house = useHouse(houseId)
  const profiles = useProfiles(houseId)
  const members = useMembers(houseId)
  const contacts = useContacts(houseId)
  const rooms = useRooms(houseId)
  const isAdmin = useIsAdmin(houseId)
  const sheets = useItemSheets()
  const now = useNow()
  const [filter, setFilter] = useState<ActivityFilter>('all')

  const pages = activity.data?.pages
  const names = useMemo(() => {
    const people = new Map((profiles.data ?? []).map((p) => [p.id as string, p.displayName]))
    const contactNames = new Map((contacts.data ?? []).map((c) => [c.id as string, c.name]))
    const roomNames = new Map((rooms.data ?? []).map((r) => [r.id as string, r.name]))
    return activityNames(mergeSubjects((pages ?? []).map((p) => p.subjects)), {
      person: (id) => people.get(id),
      contact: (id) => contactNames.get(id),
      room: (id) => roomNames.get(id),
    })
  }, [pages, profiles.data, contacts.data, rooms.data])

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

  const shown = lines.filter((l) => inActivityFilter(l, filter))
  const days = feedByDay(shown, now, tz)
  const open = (t: FeedTarget) =>
    t.kind === 'item'
      ? sheets.openItem(t.id)
      : t.kind === 'run'
        ? sheets.openRun(t.id)
        : sheets.openPoll(t.id)

  return (
    <>
      {/* Scrolls sideways if the chips ever outgrow a small phone. */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <SegmentedControl
          label="Show"
          compact
          options={ACTIVITY_FILTERS}
          value={filter}
          onChange={setFilter}
        />
      </div>
      {days.length === 0 ? (
        <p className="mt-5 font-semibold text-ink-soft">
          Nothing like that {activity.hasNextPage ? 'in the latest activity' : 'yet'}.
        </p>
      ) : (
        days.map((day) => (
          <section key={day.date} aria-labelledby={`day-${day.date}`} className="mt-5">
            <h2
              id={`day-${day.date}`}
              className="m-0 mb-2 text-[0.8rem] font-extrabold tracking-[.04em] text-ink-soft uppercase"
            >
              {day.heading}
            </h2>
            <ol aria-label={day.heading} className="m-0 grid list-none gap-3 p-0">
              {day.lines.map((line) => (
                <Line
                  key={line.actionId}
                  line={line}
                  who={line.actorId ? names.person(line.actorId) : undefined}
                  element={line.actorId ? elementOf.get(line.actorId) : undefined}
                  onOpen={open}
                />
              ))}
            </ol>
          </section>
        ))
      )}
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

function Line({
  line,
  who,
  element,
  onOpen,
}: {
  line: FeedLine & { time: string }
  who: string | undefined
  element: Parameters<typeof Avatar>[0]['element']
  onOpen: (t: FeedTarget) => void
}) {
  const { icon: Icon, label } = TOPIC[line.topic]
  const body = (
    <>
      <span data-line-text className="block leading-snug font-semibold">
        {line.text}
      </span>
      {line.detail && (
        <span className="mt-0.5 block text-[0.85rem] leading-snug text-ink-soft">
          {line.detail}
        </span>
      )}
      <span className="mt-0.5 flex items-center gap-1 text-[0.8rem] font-semibold text-ink-soft">
        <Icon aria-hidden className="size-3.5" strokeWidth={2} />
        {label} · {line.time}
      </span>
    </>
  )
  const target = line.target
  return (
    <li className="flex items-start gap-3">
      <Avatar name={who ?? 'Roomies'} element={element} />
      {target ? (
        <button
          type="button"
          onClick={() => onOpen(target)}
          className="-m-1.5 flex min-w-0 flex-1 items-center gap-2 rounded-xl p-1.5 text-left hover:bg-neutral-fill focus-visible:bg-neutral-fill"
        >
          <span className="min-w-0 flex-1">{body}</span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-soft" strokeWidth={2} />
        </button>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}
    </li>
  )
}
