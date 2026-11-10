'use client'

import { useEffect, useState } from 'react'
import { TURN_ON_TOASTS, turnOnPush } from '@/components/house/turn-on-push'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { pushPromptFor, type PushPrompt } from '@/lib/client/install'
import { useAppClient } from '@/lib/client/provider'
import { pushState } from '@/lib/client/push'

const DONE_KEY = 'roomies.pushPromptDone'

const answered = (): boolean => {
  try {
    return localStorage.getItem(DONE_KEY) !== null
  } catch {
    return false
  }
}

const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const COPY: Record<PushPrompt, { title: string; description: string }> = {
  ask: {
    title: 'Turn on notifications?',
    description:
      'A ping when something is yours, a poll needs your vote, or someone joins. You pick which ones in your settings.',
  },
  blocked: {
    title: 'Notifications are blocked',
    description:
      'To get pings, allow notifications for Roomies in your browser’s or phone’s settings, then come back.',
  },
  unsupported: {
    title: 'No notifications on this browser',
    description: 'You’ll still see everything in the app. Notifications work on other browsers.',
  },
}

/**
 * Notifications on from the start (T95): the first time the app opens on a device where push
 * isn't on, one sheet offers it. Any answer is remembered on this device; Me → Notifications is
 * where to change it later.
 */
export function NotificationsPrompt() {
  const { commands, vapidPublicKey } = useAppClient()
  const toast = useToast()
  const [prompt, setPrompt] = useState<PushPrompt | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (answered()) return
    let live = true
    void (async () => {
      const state = await pushState()
      const next = pushPromptFor(state, {
        userAgent: navigator.userAgent,
        standalone: isStandalone(),
        dismissed: answered(),
      })
      if (live && next) setPrompt(next)
    })()
    return () => {
      live = false
    }
  }, [])

  const done = () => {
    setPrompt(null)
    try {
      localStorage.setItem(DONE_KEY, String(Date.now()))
    } catch {
      // Private mode: it asks again next time.
    }
  }

  const turnOn = async () => {
    setBusy(true)
    const r = await turnOnPush(commands, vapidPublicKey)
    setBusy(false)
    toast(TURN_ON_TOASTS[r])
    if (r !== 'failed') done()
  }

  if (!prompt) return null
  const { title, description } = COPY[prompt]
  return (
    <Sheet open onOpenChange={(o) => !o && done()} title={title} description={description}>
      {prompt === 'ask' ? (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" block onClick={done}>
            Not now
          </Button>
          <Button block disabled={busy} onClick={turnOn}>
            Turn on
          </Button>
        </div>
      ) : (
        <Button variant="secondary" block onClick={done}>
          Got it
        </Button>
      )}
    </Sheet>
  )
}
