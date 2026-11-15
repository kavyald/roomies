'use client'

import { BookUser, CalendarDays, CalendarSync, History, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import {
  useContacts,
  useHouse,
  useIsAdmin,
  useItems,
  useMembers,
  useRoutines,
  useRuns,
} from '@/lib/client/hooks'
import { useNow } from '@/lib/client/use-now'
import { comingUp } from '@/lib/domain/calendar'
import type { HouseId } from '@/lib/domain/ids'
import { localDateOf } from '@/lib/domain/time'
import { FeelingWeightsRow } from './FeelingWeightsSection'
import { HousePolls } from './HousePolls'
import { RoomsRow } from './RoomsSection'
import { SplitwiseRow } from './SplitwiseSection'
import { WeightsChangedCard } from './WeightsChangedCard'

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** One labelled box of setup rows: People, Chores, Money, Priority (T107). */
function SetupGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = `setup-${title.toLowerCase()}`
  return (
    <section aria-labelledby={id} className="grid gap-2">
      <h2 id={id} className="m-0 text-sm font-extrabold tracking-[.02em] text-ink-soft uppercase">
        {title}
      </h2>
      <ListGroup label={title}>{children}</ListGroup>
    </section>
  )
}

/**
 * The House tab (FRONTEND §5.1, T107; Admin before): polls, the feeling-weights card, Calendar and
 * Activity, then the house's setup in four labelled groups. Nothing personal: that's on You.
 */
export function HouseScreen({
  houseId,
  showWeights,
}: {
  houseId: HouseId
  /** Opened from an item's "How feelings raise priority" link (`?priority`, T108). */
  showWeights?: boolean
}) {
  const members = useMembers(houseId)
  const contacts = useContacts(houseId)
  const routines = useRoutines(houseId)
  const items = useItems(houseId)
  const runs = useRuns(houseId)
  const house = useHouse(houseId)
  const isAdmin = useIsAdmin(houseId)
  const now = useNow()

  if (members.isError || house.isError) {
    return (
      <p role="alert" className="font-bold text-ink-soft">
        Couldn&apos;t reach the house. Check your connection and try again.
      </p>
    )
  }
  if (members.isPending || !house.data) return <p className="text-ink-soft">Loading…</p>

  const base = `/h/${houseId}`
  const today = localDateOf(now, house.data.settings.timezone)
  const thisWeek = comingUp(items.data ?? [], runs.data ?? [], today).length
  const people = members.data.filter((m) => m.status.active).length
  const contactCount = contacts.data?.length ?? 0
  const routineCount = routines.data?.length ?? 0

  return (
    <div className="grid gap-6">
      <HousePolls houseId={houseId} />
      <WeightsChangedCard houseId={houseId} />
      <ListGroup label="Around the house">
        <ListRow
          href={`${base}/calendar`}
          leading={<CalendarDays aria-hidden className="size-5 text-ink-soft" />}
          title="Calendar"
          subtitle={thisWeek ? `${thisWeek} this week` : 'Nothing this week'}
        />
        <ListRow
          href={`${base}/activity`}
          leading={<History aria-hidden className="size-5 text-ink-soft" />}
          title="Activity"
          subtitle="Everything that happened in the house"
        />
      </ListGroup>

      <SetupGroup title="People">
        <ListRow
          href={`${base}/house/roommates`}
          leading={<Users aria-hidden className="size-5 text-ink-soft" />}
          title={isAdmin ? 'Roommates and invites' : 'Roommates'}
          subtitle={count(people, 'person', 'people')}
        />
        <ListRow
          href={`${base}/house/contacts`}
          leading={<BookUser aria-hidden className="size-5 text-ink-soft" />}
          title="Contacts"
          subtitle={
            contactCount ? count(contactCount, 'contact', 'contacts') : 'The super, the landlord…'
          }
        />
      </SetupGroup>

      <SetupGroup title="Chores">
        <ListRow
          href={`${base}/house/routines`}
          leading={<CalendarSync aria-hidden className="size-5 text-ink-soft" />}
          title="Routines"
          subtitle={
            routineCount
              ? count(routineCount, 'routine', 'routines')
              : 'Who looks after which rooms'
          }
        />
        <RoomsRow houseId={houseId} />
      </SetupGroup>

      <SetupGroup title="Money">
        <SplitwiseRow houseId={houseId} />
      </SetupGroup>

      <SetupGroup title="Priority">
        <FeelingWeightsRow houseId={houseId} linked={showWeights} />
      </SetupGroup>
    </div>
  )
}
