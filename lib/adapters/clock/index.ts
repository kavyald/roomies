import type { Clock } from '../../app/ports'
import { instant, plusMs, type Instant } from '../../domain/time'

export const systemClock: Clock = { now: () => instant(Date.now()) }

export type FixedClock = Clock & {
  set(at: Instant): void
  advance(ms: number): void
}

/** A clock that only moves when told to. */
export const fixedClock = (start: Instant): FixedClock => {
  let at = start
  return {
    now: () => at,
    set: (next) => {
      at = next
    },
    advance: (ms) => {
      at = plusMs(at, ms)
    },
  }
}
