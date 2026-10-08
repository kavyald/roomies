// Runs in the browser before the app is interactive: starts error reporting when a DSN is set (A28).
import { startErrorReporting, TUNNEL_PATH } from './lib/adapters/sentry'
import { errorReportingConfig } from './lib/config'

startErrorReporting(errorReportingConfig(), TUNNEL_PATH)
