'use client'

import type { ReactNode } from 'react'
import { useContacts, useIsAdmin, useMembers, useProfiles } from '@/lib/client/hooks'
import type { HouseId } from '@/lib/domain/ids'
import { ContactsSection } from './ContactsSection'
import { InvitesSection } from './InvitesSection'
import { RoommatesSection } from './RoommatesSection'

// The House tab's People pages (T107). Routines is RoutinesSection on its own page.

function Gate({
  error,
  pending,
  children,
}: {
  error: boolean
  pending: boolean
  children: ReactNode
}) {
  if (error) {
    return (
      <p role="alert" className="font-bold text-ink-soft">
        Couldn&apos;t reach the house. Check your connection and try again.
      </p>
    )
  }
  if (pending) return <p className="text-ink-soft">Loading…</p>
  return <>{children}</>
}

/** House → People → Roommates (and, for organizers, the invite link). */
export function RoommatesScreen({ houseId }: { houseId: HouseId }) {
  const members = useMembers(houseId)
  const profiles = useProfiles(houseId)
  const isAdmin = useIsAdmin(houseId)
  return (
    <Gate
      error={members.isError || profiles.isError}
      pending={members.isPending || profiles.isPending}
    >
      <RoommatesSection houseId={houseId} />
      {isAdmin && (
        <>
          <h2 className="mt-6 mb-2.5 text-[1.0625rem] font-extrabold">Invite a roommate</h2>
          <InvitesSection houseId={houseId} />
        </>
      )}
    </Gate>
  )
}

/** House → People → Contacts. */
export function ContactsScreen({ houseId }: { houseId: HouseId }) {
  const contacts = useContacts(houseId)
  return (
    <Gate error={contacts.isError} pending={contacts.isPending}>
      <ContactsSection houseId={houseId} />
    </Gate>
  )
}
