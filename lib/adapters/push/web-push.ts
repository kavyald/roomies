// PushSender over the Web Push protocol (VAPID), the only place `web-push` is used.
import webpush from 'web-push'
import type { PushSender } from '../../app/ports'

/** A Retry-After header in seconds (the push services send seconds, not a date). */
export const retryAfter = (value: string | undefined): number | undefined => {
  const seconds = Number(value)
  return value && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined
}

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
      return { kind: 'sent' }
    } catch (e) {
      const { statusCode, headers } = e as {
        statusCode?: number
        headers?: Record<string, string | undefined>
      }
      // The browser unsubscribed or the subscription expired: stop sending to it.
      if (statusCode === 404 || statusCode === 410) return { kind: 'gone' }
      // Anything else may pass (5xx, 429, a timeout): the sender tries again later (T84).
      const retryAfterMs = retryAfter(headers?.['retry-after'])
      return { kind: 'failed', ...(retryAfterMs !== undefined && { retryAfterMs }) }
    }
  },
})
