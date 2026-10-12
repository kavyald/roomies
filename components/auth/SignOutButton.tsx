'use client'

import { useState } from 'react'
import { signOut } from '@/app/actions/auth'
import { Button } from '@/components/ui/Button'
import { unsubscribeThisBrowser } from '@/lib/client/push'

/** Signs out, and stops this browser getting your notifications first (T84). */
export function SignOutButton() {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="secondary"
      block
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const endpoint = await unsubscribeThisBrowser()
        await signOut(endpoint ? { endpoint } : undefined)
      }}
    >
      Sign out
    </Button>
  )
}
