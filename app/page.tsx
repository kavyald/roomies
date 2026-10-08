import { DoorOpen } from 'lucide-react'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { makeWhereTo } from '@/lib/app/session'
import { depsForRequest } from '@/lib/compose'
import { currentUserId } from '@/lib/server/session'

/** Sends each person where they belong: sign-in, their house, or a note if they have none. */
export default async function Start() {
  const userId = await currentUserId()
  if (!userId) redirect('/sign-in')

  const dest = await makeWhereTo(depsForRequest({ actor: { kind: 'user', userId } }))(userId)
  if (dest.to === 'house') redirect(`/h/${dest.houseId}`)

  return (
    <main className="mx-auto grid min-h-dvh max-w-[430px] content-center gap-4 px-4">
      <EmptyState icon={DoorOpen}>
        {dest.to === 'moved_out'
          ? "You're no longer a member of this house. Thanks for being a roomie. 💛"
          : "You're signed in, but you're not in a house yet. Ask a roommate for an invite link."}
      </EmptyState>
      <SignOutButton />
    </main>
  )
}
