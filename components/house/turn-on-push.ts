import type { AppCommands } from '@/lib/client/app-client'
import { subscribeThisBrowser } from '@/lib/client/push'

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
