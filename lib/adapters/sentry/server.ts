// Server-side error reports (ARCHITECTURE A28), for the Node and edge runtimes only.

import * as Sentry from '@sentry/nextjs'
import { waitUntil } from '@vercel/functions'

/** How long a function stays alive after the response to finish sending a report. */
const FLUSH_MS = 2000

/**
 * Keeps a Vercel function alive until the report is sent. Vercel freezes a function once its
 * response ends, and the SDK's own wait (@sentry/core's vercelWaitUntil) only runs on the edge
 * runtime, so on Node a report still sending was cut off (T79). Off Vercel this does nothing.
 */
const flushBeforeFreeze = (): void => {
  waitUntil(Sentry.flush(FLUSH_MS))
}

/** An error the app caught and answered for itself (an action's 'unexpected', a failed job). */
export const reportError = (e: unknown, where: string): void => {
  Sentry.captureException(e, { tags: { where } })
  flushBeforeFreeze()
}

/** Next's onRequestError hook: errors thrown while rendering, in route handlers and in actions. */
export const captureRequestError: typeof Sentry.captureRequestError = (...args) => {
  Sentry.captureRequestError(...args)
  flushBeforeFreeze()
}
