// Web Push (PRD §11, ARCHITECTURE §7.1): a browser's subscription, and what a push carries. Pure.

import type { OutboxMessage } from './notifications'
import type { UserId } from './ids'
import { err, ok, type Result } from './result'
import type { Instant } from './time'

export type PushSubscription = {
  readonly id: string
  readonly userId: UserId
  readonly endpoint: string
  readonly keys: { readonly p256dh: string; readonly auth: string }
  readonly userAgent?: string
  readonly createdAt: Instant
  readonly lastOkAt?: Instant
  readonly goneAt?: Instant
}

/** What the browser hands over from `pushManager.subscribe(...).toJSON()`. */
export type BrowserSubscription = {
  readonly endpoint: string
  readonly keys: { readonly p256dh: string; readonly auth: string }
}

/** A message waiting in the outbox. */
export type PendingMessage = OutboxMessage & { readonly id: number }

/** What a push service said about one delivery. */
export type PushOutcome = 'sent' | 'gone' | 'failed'

/** Checks what the browser sent before storing it. */
export const newSubscription = (
  input: BrowserSubscription,
  ctx: {
    readonly id: string
    readonly userId: UserId
    readonly now: Instant
    readonly userAgent?: string
  },
): Result<PushSubscription, 'invalid_subscription'> => {
  const { endpoint, keys } = input
  if (!/^https:\/\/\S+$/.test(endpoint) || !keys.p256dh || !keys.auth) {
    return err('invalid_subscription')
  }
  return ok({
    id: ctx.id,
    userId: ctx.userId,
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    ...(ctx.userAgent && { userAgent: ctx.userAgent.slice(0, 400) }),
    createdAt: ctx.now,
  })
}

/** The JSON the service worker turns into a notification. `tag` folds repeats together. */
export const pushPayload = (m: PendingMessage): string =>
  JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: `${m.category}:${m.url}` })

/**
 * How a message went: sent if any browser took it; otherwise the reason, so it isn't retried
 * forever ("no_subscription" when they haven't turned notifications on anywhere).
 */
export const deliveryResult = (outcomes: readonly PushOutcome[]): string | null =>
  outcomes.includes('sent')
    ? null
    : outcomes.length === 0
      ? 'no_subscription'
      : outcomes.every((o) => o === 'gone')
        ? 'subscriptions_gone'
        : 'push_failed'
