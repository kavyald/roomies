'use client'

import { Bell, BellOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useAppClient } from '@/lib/client/provider'
import { pushState, subscribeThisBrowser, type PushState } from '@/lib/client/push'

const LINES: Record<PushState, string> = {
  on: 'On for this device.',
  off: 'Off on this device.',
  blocked: 'Blocked for Roomies in this browser’s settings.',
  install_first: 'Add Roomies to your Home Screen first, then turn them on from there.',
  unsupported: 'This browser can’t show notifications.',
}

/**
 * This device's push status, with its one button (T34, T61). A flush row inside the Notifications
 * section of your settings; which ones you get is the rest of that section.
 */
export function PushSettings() {
  const { commands, vapidPublicKey } = useAppClient()
  const toast = useToast()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void pushState().then((s) => live && setState(s))
    return () => {
      live = false
    }
  }, [])

  if (!state) return null

  const turnOn = async () => {
    setBusy(true)
    const r = await subscribeThisBrowser(vapidPublicKey)
    if (!r.ok) {
      setBusy(false)
      setState(r.reason === 'denied' ? 'blocked' : 'off')
      return toast(
        r.reason === 'denied'
          ? 'Okay, no notifications. You can turn them on later.'
          : "Couldn't turn notifications on. Try again.",
      )
    }
    const saved = await commands.savePushSubscription(r.subscription)
    setBusy(false)
    if (!saved.ok) return toast("Couldn't turn notifications on. Try again.")
    setState('on')
    toast('Notifications are on. 🔔')
  }

  const Icon = state === 'on' ? Bell : BellOff
  return (
    <div
      aria-label="This device"
      role="group"
      className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5"
    >
      <Icon aria-hidden className="size-5 flex-none text-ink-soft" />
      <p className="m-0 min-w-0 flex-1 font-semibold">{LINES[state]}</p>
      {state === 'off' && (
        <Button size="small" disabled={busy} onClick={turnOn}>
          Turn on notifications
        </Button>
      )}
    </div>
  )
}
