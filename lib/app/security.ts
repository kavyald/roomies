// The security log's side of the join and setup use cases (ARCHITECTURE §5.4): refused attempts
// are recorded through the `SecurityLog` port, outside the use case's transaction.

import type { AppDeps } from './ports'
import type { SecurityStep } from '../domain/security'
import type { Instant } from '../domain/time'

/** One try at joining or setting up: who (by IP), where, and when. */
export type Attempt = { readonly ip: string; readonly step: SecurityStep; readonly now: Instant }

/** Counts one attempt against `<key>:<ip>`; a refusal is logged as `rate_limited`. */
export const withinRate = async (
  { limiter, securityLog }: Pick<AppDeps, 'limiter' | 'securityLog'>,
  key: string,
  rule: { limit: number; windowMs: number },
  at: Attempt,
): Promise<boolean> => {
  if (await limiter.hit(`${key}:${at.ip}`, rule, at.now)) return true
  await securityLog.record({ kind: 'rate_limited', step: at.step, ip: at.ip, at: at.now })
  return false
}
