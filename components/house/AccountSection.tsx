'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { useAppClient } from '@/lib/client/provider'

/** Delete my account (PRD §10), behind a plain confirmation. */
export function DeleteAccount() {
  const { commands } = useAppClient()
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    const r = await commands.deleteAccount()
    setBusy(false)
    if (!r.ok) {
      return toast(
        r.error === 'last_admin'
          ? 'The house needs an admin. Make someone else an admin first.'
          : "Couldn't delete your account. Try again.",
      )
    }
    router.replace('/sign-in')
  }

  return (
    <>
      <button
        type="button"
        className="min-h-11 text-sm font-bold text-ink-soft underline"
        onClick={() => setOpen(true)}
      >
        Delete my account
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Delete your account?"
        description="This removes your email and profile. Your name on past items will show as “Former roommate.”"
      >
        <Button block disabled={busy} onClick={confirm}>
          Delete my account
        </Button>
        <Button variant="secondary" block onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </Sheet>
    </>
  )
}
