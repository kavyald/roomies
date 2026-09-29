import type { ItemId, UserId } from './ids'
import type { Instant } from './time'

export type FeelingKind = 'anxious' | 'frustrated' | 'confused' | 'fine' | 'meh' | 'thanks'

/** How one person feels about one item (ARCHITECTURE §6.3). Never about a person. */
export type Feeling = {
  readonly itemId: ItemId
  readonly by: UserId
  readonly kind: FeelingKind
  readonly note?: string
  readonly at: Instant
}

export const FEELING_KINDS: readonly FeelingKind[] = [
  'anxious',
  'frustrated',
  'confused',
  'fine',
  'meh',
  'thanks',
]

export type FeelingWeights = Readonly<Record<FeelingKind, number>>

/** PRD §8.1 defaults. The house can change them (T25). */
export const DEFAULT_FEELING_WEIGHTS: FeelingWeights = {
  anxious: 20,
  frustrated: 15,
  confused: 5,
  fine: 0,
  meh: -5,
  thanks: 0,
}
