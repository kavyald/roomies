// Feedback (T91, PRD §6.8): a bug, an idea or praise a member sends the owner from Admin. It's for
// the owner, not the house, so it records no event (ARCHITECTURE A34). Pure.

import type { FeedbackId, HouseId, UserId } from './ids'
import { err, ok, type Result } from './result'
import type { Instant } from './time'

export const FEEDBACK_KINDS = ['bug', 'idea', 'praise'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

export const MAX_FEEDBACK = 2000
export const MAX_USER_AGENT = 400
export const MAX_APP_VERSION = 64

export type Feedback = {
  readonly id: FeedbackId
  readonly houseId: HouseId
  readonly userId: UserId
  readonly kind: FeedbackKind
  readonly message: string
  /** The deployed commit (short), or 'dev' locally. Stamped by the server. */
  readonly appVersion: string
  /** The sender's browser, from the request. Stamped by the server. */
  readonly userAgent?: string
  readonly createdAt: Instant
}

export type NewFeedback = { readonly kind: FeedbackKind; readonly message: string }

/** Feedback from `by`: the message trimmed, the request facts capped to fit their columns. */
export const makeFeedback = (
  input: NewFeedback,
  ctx: {
    readonly id: FeedbackId
    readonly houseId: HouseId
    readonly by: UserId
    readonly now: Instant
    readonly appVersion: string
    readonly userAgent?: string | null
  },
): Result<Feedback, 'empty' | 'too_long'> => {
  const message = input.message.trim()
  if (!message) return err('empty')
  if (message.length > MAX_FEEDBACK) return err('too_long')
  const userAgent = ctx.userAgent?.trim().slice(0, MAX_USER_AGENT)
  return ok({
    id: ctx.id,
    houseId: ctx.houseId,
    userId: ctx.by,
    kind: input.kind,
    message,
    appVersion: ctx.appVersion.trim().slice(0, MAX_APP_VERSION) || 'dev',
    ...(userAgent && { userAgent }),
    createdAt: ctx.now,
  })
}
