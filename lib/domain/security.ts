// Security events (ARCHITECTURE §5.4): attempts Roomies refused before anyone was a member, kept
// for the owner to look at later. They're not house history, so they never go to activity_events.

import type { InviteProblem } from './invites'
import type { Instant } from './time'

/** Where the attempt came in: the join and setup pages, and their server actions. */
export type SecurityStep =
  'join.view' | 'join.start' | 'join.accept' | 'setup.view' | 'setup.start' | 'setup.finish'

export type SecurityEvent =
  | {
      readonly kind: 'invite_refused'
      readonly reason: InviteProblem
      readonly step: SecurityStep
      readonly ip: string
      readonly at: Instant
    }
  | {
      readonly kind: 'setup_token_refused' | 'rate_limited'
      readonly step: SecurityStep
      readonly ip: string
      readonly at: Instant
    }

export type SecurityEventKind = SecurityEvent['kind']
