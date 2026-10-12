// Web Push (PRD §11, ARCHITECTURE §7.4): a browser's subscription, and what a push carries. Pure.

import type { OutboxMessage } from './notifications'
import type { UserId } from './ids'
import { err, ok, type Result } from './result'
import { MS_PER_HOUR, MS_PER_MINUTE, plusMs, type Instant } from './time'

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

/** A message waiting in the outbox; `attempts` counts the tries that found no browser working. */
export type PendingMessage = OutboxMessage & { readonly id: number; readonly attempts: number }

/**
 * What a push service said about one delivery. `failed` is anything but gone (5xx, 429, a timeout,
 * no network), with how long it asked us to wait when it said (429 / 503 Retry-After).
 */
export type PushOutcome =
  | { readonly kind: 'sent' }
  | { readonly kind: 'gone' }
  | { readonly kind: 'failed'; readonly retryAfterMs?: number }

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

/** How long to wait before trying a message again, after each try where no browser worked. */
export const RETRY_DELAYS_MS = [5 * MS_PER_MINUTE, 30 * MS_PER_MINUTE, 2 * MS_PER_HOUR] as const

/** A push service's Retry-After is honored up to this. */
export const MAX_RETRY_AFTER_MS = 6 * MS_PER_HOUR

/** What to do with a message after one try: done (delivered, or why not), or try again later. */
export type AfterAttempt =
  | { readonly kind: 'done'; readonly error: string | null }
  | { readonly kind: 'retry'; readonly at: Instant; readonly error: 'push_failed' }

/**
 * Delivered if any browser took it. Otherwise final when there's nothing to retry ("no_subscription"
 * when they haven't turned notifications on anywhere, "subscriptions_gone"), and a passing failure
 * (5xx, 429, a timeout) is tried again after 5 minutes, 30 minutes and 2 hours, or later if the
 * push service asked, then given up on as "push_failed". `retriesSoFar` is the message's attempts.
 */
export const afterAttempt = (
  outcomes: readonly PushOutcome[],
  retriesSoFar: number,
  now: Instant,
): AfterAttempt => {
  const done = (error: string | null): AfterAttempt => ({ kind: 'done', error })
  if (outcomes.some((o) => o.kind === 'sent')) return done(null)
  if (outcomes.length === 0) return done('no_subscription')
  if (outcomes.every((o) => o.kind === 'gone')) return done('subscriptions_gone')
  const delay = RETRY_DELAYS_MS[retriesSoFar]
  if (delay === undefined) return done('push_failed')
  const asked = Math.max(...outcomes.map((o) => (o.kind === 'failed' && o.retryAfterMs) || 0))
  return {
    kind: 'retry',
    at: plusMs(now, Math.max(delay, Math.min(asked, MAX_RETRY_AFTER_MS))),
    error: 'push_failed',
  }
}
