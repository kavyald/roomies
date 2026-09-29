import { DoorOpen } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SetupFlow } from '@/components/setup/SetupFlow'
import { EmptyState } from '@/components/ui/EmptyState'
import { makeSetupStatus } from '@/lib/app/setup'
import { depsForJob } from '@/lib/compose'
import { currentUserId } from '@/lib/server/session'

export const metadata = { title: 'Set up your house · Roomies' }

/** The one-time setup link (ARCHITECTURE §5.2). A wrong token looks like any missing page. */
export default async function SetupPage({ params }: PageProps<'/setup/[token]'>) {
  const { token } = await params
  const status = await makeSetupStatus(depsForJob())(token)
  if (status === 'invalid_token') notFound()

  return (
    <main className="mx-auto grid min-h-dvh max-w-[430px] content-center gap-6 px-4 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      {status === 'already_set_up' ? (
        <EmptyState
          icon={DoorOpen}
          action={
            <Link href="/sign-in" className="font-extrabold text-accent-ink underline">
              Sign in
            </Link>
          }
        >
          This house is already set up.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-1">
            <h1 className="m-0 text-[1.75rem] font-extrabold">Set up your house 🏠</h1>
            <p className="m-0 text-ink-soft">
              This link works once. After this, roommates join with invite links.
            </p>
          </div>
          <SetupFlow token={token} signedIn={(await currentUserId()) !== null} />
        </>
      )}
    </main>
  )
}
