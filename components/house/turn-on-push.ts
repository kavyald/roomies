import type { AppCommands } from '@/lib/client/app-client'
import { connectsItself } from '@/lib/client/install'
import {
  pushState,
  subscribeThisBrowser,
  thisBrowsersEndpoint,
  type PushState,
} from '@/lib/client/push'

/**
 * Asks this browser for permission, subscribes it and saves it for me: the one path behind every
 * "Turn on" (Me → Notifications, T34; the first-open prompt, T95).
 */
export const turnOnPush = async (
  commands: Pick<AppCommands, 'savePushSubscription'>,
  vapidPublicKey: string,
): Promise<'on' | 'denied' | 'failed'> => {
  const r = await subscribeThisBrowser(vapidPublicKey)
  if (!r.ok) return r.reason
  const saved = await commands.savePushSubscription(r.subscription)
  return saved.ok ? 'on' : 'failed'
}

export const TURN_ON_TOASTS = {
  on: 'Notifications are on. 🔔',
  denied: 'Okay, no notifications. You can turn them on later.',
  failed: "Couldn't turn notifications on. Try again.",
} as const

let settling: Promise<{ state: PushState; connected: boolean }> | null = null

/**
 * This device's push state for me, settled (T95): "on" only if the server has this browser for me
 * too (T84), and a browser that already allows Roomies but isn't connected (someone just allowed
 * it in their settings, or signed in after someone else) is connected here, with no tap. The
 * shell and Me → Notifications both ask at load, so they share one check.
 */
export const settlePush = (
  commands: Pick<AppCommands, 'savePushSubscription' | 'isPushSubscriptionSaved'>,
  vapidPublicKey: string,
): Promise<{ state: PushState; connected: boolean }> => {
  settling ??= (async () => {
    let state = await pushState()
    if (state === 'on') {
      const endpoint = await thisBrowsersEndpoint()
      const saved = endpoint ? await commands.isPushSubscriptionSaved({ endpoint }) : null
      if (saved?.ok && !saved.value) state = 'off'
    }
    const permission = typeof Notification === 'undefined' ? 'default' : Notification.permission
    if (connectsItself(state, permission)) {
      if ((await turnOnPush(commands, vapidPublicKey)) === 'on')
        return { state: 'on' as const, connected: true }
    }
    return { state, connected: false }
  })().finally(() => {
    settling = null
  })
  return settling
}
