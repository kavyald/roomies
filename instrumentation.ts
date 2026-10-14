import { startErrorReporting } from './lib/adapters/sentry'
import { captureRequestError } from './lib/adapters/sentry/server'
import { checkConfigAtStartup, errorReportingConfig } from './lib/config'

export function register() {
  checkConfigAtStartup()
  startErrorReporting(errorReportingConfig())
}

// Errors Next catches while rendering, in route handlers, in actions and in proxy.ts (A28).
export const onRequestError = captureRequestError
