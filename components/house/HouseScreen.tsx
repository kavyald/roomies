'use client'

import { ChevronRight, History, Phone, Users } from 'lucide-react'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListGroup, ListRow } from '@/components/ui/ListRow'
import { elementName } from '@/components/ui/elements'
import { useContacts, useIsAdmin, useMembers, useProfiles, useRooms } from '@/lib/client/hooks'
import { InvitesSection } from './InvitesSection'
import type { HouseId } from '@/lib/domain/ids'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-5 mb-2.5 text-[1.0625rem] font-extrabold">{children}</h2>
}

/** The House tab: roommates and contacts (rooms, invites and settings join in T15–T17, T25). */
export function HouseScreen({ houseId }: { houseId: HouseId }) {
  const members = useMembers(houseId)
  const profiles = useProfiles(houseId)
  const rooms = useRooms(houseId)
  const contacts = useContacts(houseId)
  const isAdmin = useIsAdmin(houseId)

  if (members.isError || profiles.isError || contacts.isError) {
    return (
      <p role="alert" className="font-bold text-ink-soft">
        Couldn&apos;t reach the house. Check your connection and try again.
      </p>
    )
  }
  if (members.isPending || profiles.isPending || contacts.isPending) {
    return <p className="text-ink-soft">Loading…</p>
  }

  const nameOf = new Map(profiles.data.map((p) => [p.id, p.displayName]))
  const roomOf = new Map((rooms.data ?? []).map((r) => [r.id, r]))
  const active = members.data.filter((m) => m.status.active)

  return (
    <>
      <SectionTitle>Roommates</SectionTitle>
      {active.length === 0 ? (
        <EmptyState icon={Users}>Your roommates will show up here once they join.</EmptyState>
      ) : (
        <ListGroup label="Roommates">
          {active.map((m) => {
            const name = nameOf.get(m.userId) ?? 'Former roommate'
            const room = m.roomId ? roomOf.get(m.roomId) : undefined
            return (
              <ListRow
                key={m.userId}
                leading={<Avatar name={name} element={room?.element} />}
                title={name}
                subtitle={
                  [
                    room?.element ? `${elementName[room.element]} room` : room?.name,
                    m.role === 'admin' && 'Admin',
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
              />
            )
          })}
        </ListGroup>
      )}

      {isAdmin && (
        <>
          <SectionTitle>Invite a roommate</SectionTitle>
          <InvitesSection houseId={houseId} />
        </>
      )}

      <SectionTitle>Contacts</SectionTitle>
      {contacts.data.filter((c) => !c.archivedAt).length === 0 ? (
        <EmptyState icon={Phone}>No contacts yet. Add the super or the landlord.</EmptyState>
      ) : (
        <ListGroup label="Contacts">
          {contacts.data
            .filter((c) => !c.archivedAt)
            .map((c) => (
              <ListRow key={c.id} title={c.name} subtitle={c.phone} />
            ))}
        </ListGroup>
      )}

      <SectionTitle>History</SectionTitle>
      <Link
        href={`/h/${houseId}/activity`}
        className="sticker flex min-h-11 items-center gap-3 rounded-[20px] border-[1.5px] border-outline bg-card px-3.5 py-3 font-bold"
      >
        <History aria-hidden className="size-5 text-ink-soft" />
        <span className="flex-1">Activity</span>
        <ChevronRight aria-hidden className="size-5 text-ink-soft" />
      </Link>
    </>
  )
}
