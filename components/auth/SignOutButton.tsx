'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signOut } from '@/app/actions/auth'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { thisBrowsersEndpoint, unsubscribeThisBrowser } from '@/lib/client/push'

/**
 * Signs out, and stops this browser getting your notifications (T84): the server forgets it with
 * the sign-out, and the browser unsubscribes only once that went through, so a failed sign-out
 * leaves notifications as they were. Leaving /h/* drops the house's cache with its providers.
 */
export function SignOutButton() {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const router = useRouter()
  return (
    <Button
      variant="secondary"
      block
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const endpoint = await thisBrowsersEndpoint()
          const r = await signOut(endpoint ? { endpoint } : undefined)
          if (r.ok) {
            await unsubscribeThisBrowser()
            router.replace('/sign-in')
            router.refresh()
            return
          }
        } catch {
          // Shown below, like a refusal.
        }
        setBusy(false)
        toast("Couldn't sign you out. Try again.")
      }}
    >
      Sign out
    </Button>
  )
}
