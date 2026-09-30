'use client'

import { ChevronRight, History } from 'lucide-react'
import Link from 'next/link'
import { useContacts, useIsAdmin, useMembers, useProfiles } from '@/lib/client/hooks'
import type { HouseId } from '@/lib/domain/ids'
import { ContactsSection } from './ContactsSection'
import { FeelingWeightsSection } from './FeelingWeightsSection'
import { InvitesSection } from './InvitesSection'
import { RoommatesSection } from './RoommatesSection'
import { RoomsSection } from './RoomsSection'
import { SpentThisMonth } from './SpentThisMonth'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-6 mb-2.5 text-[1.0625rem] font-extrabold">{children}</h2>
}

/** The House tab: roommates, invites, rooms, contacts, history (FRONTEND §5.11). */
export function HouseScreen({ houseId }: { houseId: HouseId }) {
  const members = useMembers(houseId)
  const profiles = useProfiles(houseId)
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

  return (
    <>
      <SectionTitle>Roommates</SectionTitle>
      <RoommatesSection houseId={houseId} />

      {isAdmin && (
        <>
          <SectionTitle>Invite a roommate</SectionTitle>
          <InvitesSection houseId={houseId} />
        </>
      )}

      <SectionTitle>Contacts</SectionTitle>
      <ContactsSection houseId={houseId} />

      <SectionTitle>Rooms</SectionTitle>
      <RoomsSection houseId={houseId} />

      <SectionTitle>Money</SectionTitle>
      <SpentThisMonth houseId={houseId} />

      <SectionTitle>Settings</SectionTitle>
      <FeelingWeightsSection houseId={houseId} />

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
