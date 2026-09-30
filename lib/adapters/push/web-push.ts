// PushSender over the Web Push protocol (VAPID), the only place `web-push` is used.
import webpush from 'web-push'
import type { PushSender } from '../../app/ports'

export const webPushSender = (vapid: {
  readonly subject: string
  readonly publicKey: string
  readonly privateKey: string
}): PushSender => ({
  send: async (sub, payload) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
        payload,
        { vapidDetails: vapid, TTL: 60 * 60 * 24, urgency: 'normal' },
      )
      return 'sent'
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      // The browser unsubscribed or the subscription expired: stop sending to it.
      return status === 404 || status === 410 ? 'gone' : 'failed'
    }
  },
})
