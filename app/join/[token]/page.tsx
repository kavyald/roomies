import { DoorClosed } from 'lucide-react'
import { JoinFlow } from '@/components/join/JoinFlow'
import { EmptyState } from '@/components/ui/EmptyState'
import { makeInviteDetails } from '@/lib/app/invites'
import { depsForJob } from '@/lib/compose'
import { inviteProblemCopy } from '@/lib/domain/invites'
import { currentUserId } from '@/lib/server/session'

export const metadata = { title: 'Join the house · Roomies' }

/** Where an invite link lands (ARCHITECTURE §5.2). */
export default async function JoinPage({ params }: PageProps<'/join/[token]'>) {
  const { token } = await params
  const invite = await makeInviteDetails(depsForJob())(token)

  return (
    <main className="mx-auto grid min-h-dvh max-w-[430px] content-center gap-6 px-4 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      {invite.ok ? (
        <>
          <div className="grid gap-1">
            <h1 className="m-0 text-[1.75rem] leading-tight font-extrabold">
              {invite.value.invitedBy} invited you to {invite.value.houseName} 🏠
            </h1>
            <p className="m-0 text-ink-soft">
              Needs, chores, and tasks for the house, all in one place.
            </p>
          </div>
          <JoinFlow
            token={token}
            bedrooms={invite.value.bedrooms}
            signedIn={(await currentUserId()) !== null}
          />
        </>
      ) : (
        <EmptyState icon={DoorClosed}>{inviteProblemCopy[invite.error]}</EmptyState>
      )}
    </main>
  )
}
