'use client'

import { Bell, BellOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useAppClient } from '@/lib/client/provider'
import { pushState, subscribeThisBrowser, type PushState } from '@/lib/client/push'

const LINES: Record<Exclude<PushState, 'off'>, string> = {
  on: 'Notifications are on for this device.',
  blocked: 'Notifications are blocked for Roomies in this browser’s settings.',
  install_first: 'Add Roomies to your Home Screen first, then turn notifications on from there.',
  unsupported: 'This browser can’t show notifications.',
}

/** "Turn on notifications" for this device (T34). Which ones you get is in your settings (T36). */
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
      aria-label="Notifications on this device"
      role="group"
      className="sticker grid gap-2.5 rounded-[20px] border-[1.5px] border-outline bg-card px-3.5 py-3"
    >
      <p className="m-0 flex items-start gap-3 font-bold">
        <Icon aria-hidden className="mt-0.5 size-5 flex-none text-ink-soft" />
        <span>{state === 'off' ? 'Get a nudge when something needs you.' : LINES[state]}</span>
      </p>
      {state === 'off' && (
        <Button size="small" className="justify-self-start" disabled={busy} onClick={turnOn}>
          Turn on notifications
        </Button>
      )}
    </div>
  )
}
