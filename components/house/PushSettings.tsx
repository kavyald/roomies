'use client'

import { Bell, BellOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useAppClient } from '@/lib/client/provider'
import { pushState, thisBrowsersEndpoint, type PushState } from '@/lib/client/push'
import { NotificationSteps } from './NotificationSteps'
import { TURN_ON_TOASTS, turnOnPush } from './turn-on-push'

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
    void (async () => {
      let s = await pushState()
      // "On" only if the server has this browser for me too (T84): after someone else used this
      // phone, or if saving it never went through, it's "off", so the button saves it again.
      if (s === 'on') {
        const endpoint = await thisBrowsersEndpoint()
        const saved = endpoint ? await commands.isPushSubscriptionSaved({ endpoint }) : null
        if (saved?.ok && !saved.value) s = 'off'
      }
      if (live) setState(s)
    })()
    return () => {
      live = false
    }
  }, [commands])

  if (!state) return null

  const turnOn = async () => {
    setBusy(true)
    const r = await turnOnPush(commands, vapidPublicKey)
    setBusy(false)
    if (r !== 'failed') setState(r === 'on' ? 'on' : 'blocked')
    toast(TURN_ON_TOASTS[r])
  }

  const Icon = state === 'on' ? Bell : BellOff
  const help = state === 'blocked' || state === 'unsupported' ? state : null
  return (
    <>
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
      {help && (
        <div className="px-3.5 pb-3">
          <NotificationSteps kind={help} />
        </div>
      )}
    </>
  )
}
