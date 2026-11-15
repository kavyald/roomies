'use client'

import { useEffect, useState } from 'react'
import { settlePush, TURN_ON_TOASTS, turnOnPush } from '@/components/house/turn-on-push'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { isStandalone, pushAnswered, rememberPushAnswered } from '@/lib/client/device-memory'
import { pushPromptFor } from '@/lib/client/install'
import { useAppClient } from '@/lib/client/provider'

/** One line on what notifications bring, shared with onboarding's step (T110). */
export const PUSH_PITCH =
  'A ping when something is yours, a poll needs your vote, or someone joins. You pick which ones in your settings.'

/**
 * Notifications on from the start (T95): the first time the app opens on a device where push is
 * off, one sheet asks. New members answer in onboarding (T110), so this is for members who never
 * did on this device. Blocked or unsupported devices get no sheet here (nobody's first screen is a
 * problem); You → Notifications has the steps. Any answer is remembered on this device.
 */
export function NotificationsPrompt() {
  const { commands, vapidPublicKey } = useAppClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void (async () => {
      // Allowed but not connected (they just followed the steps): on, with no tap (T95).
      const { state, connected } = await settlePush(commands, vapidPublicKey)
      if (connected) {
        if (live) toast(TURN_ON_TOASTS.on)
        return
      }
      const next = pushPromptFor(state, {
        userAgent: navigator.userAgent,
        standalone: isStandalone(),
        dismissed: pushAnswered(),
      })
      if (live && next) setOpen(true)
    })()
    return () => {
      live = false
    }
  }, [commands, vapidPublicKey, toast])

  const done = () => {
    setOpen(false)
    rememberPushAnswered(Date.now())
  }

  const turnOn = async () => {
    setBusy(true)
    const r = await turnOnPush(commands, vapidPublicKey)
    setBusy(false)
    toast(TURN_ON_TOASTS[r])
    if (r !== 'failed') done()
  }

  if (!open) return null
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && done()}
      title="Turn on notifications?"
      description={PUSH_PITCH}
    >
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" block onClick={done}>
          Not now
        </Button>
        <Button block disabled={busy} onClick={turnOn}>
          Turn on
        </Button>
      </div>
    </Sheet>
  )
}
