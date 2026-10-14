// PushSender over the Web Push protocol (VAPID), the only place `web-push` is used.
import webpush from 'web-push'
import type { PushSender } from '../../app/ports'
import type { PushOutcome } from '../../domain/push'

/** A Retry-After header in seconds (the push services send seconds, not a date). */
export const retryAfter = (value: string | undefined): number | undefined => {
  const seconds = Number(value)
  return value && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined
}

/**
 * What a push service's error means (T84): 404/410, the browser unsubscribed or expired, so stop
 * sending to it; 429, 5xx or no answer at all may pass, so try again later; any other 4xx won't.
 */
export const outcomeOf = (
  statusCode: number | undefined,
  retryAfterHeader?: string,
): PushOutcome => {
  if (statusCode === 404 || statusCode === 410) return { kind: 'gone' }
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500 && statusCode !== 429)
    return { kind: 'rejected' }
  const retryAfterMs = retryAfter(retryAfterHeader)
  return { kind: 'failed', ...(retryAfterMs !== undefined && { retryAfterMs }) }
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
      return outcomeOf(statusCode, headers?.['retry-after'])
    }
  },
})
