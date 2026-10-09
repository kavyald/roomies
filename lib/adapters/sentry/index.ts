// Error reporting to Sentry (ARCHITECTURE A28). One module for the server, the edge runtime and the
// browser: @sentry/nextjs picks the right SDK for each. Errors only (no tracing, no replay), so
// nothing is sampled from normal requests. Without a DSN nothing starts and every call is a no-op.
// The server-only reporters live in ./server, so the browser bundle never pulls in @vercel/functions.

import * as Sentry from '@sentry/nextjs'
import { scrubBreadcrumb, scrubEvent } from './scrub'

/** lib/config's ErrorReportingConfig (adapters get config handed to them, never import it). */
export type SentryConfig = { readonly dsn: string; readonly environment: string }

/** Where the browser posts its reports: this origin, so the page CSP needs no Sentry host. */
export const TUNNEL_PATH = '/monitoring'

export const sentryOptions = (config: SentryConfig, tunnel?: string) => ({
  dsn: config.dsn,
  tunnel,
  environment: config.environment,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
})

export const startErrorReporting = (config: SentryConfig | null, tunnel?: string): void => {
  if (config) Sentry.init(sentryOptions(config, tunnel))
}
