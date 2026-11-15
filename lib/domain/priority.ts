// Priority (PRD §8.1, ARCHITECTURE §7.1). Pure: weights, `now` and the house's time zone are
// arguments, so screens, jobs and tests all score the same way.

import {
  activeFeelings,
  FEELING_META,
  type Feeling,
  type FeelingKind,
  type FeelingWeights,
} from './feelings'
import { nearDay } from './format'
import type { UserId } from './ids'
import type { Item, Priority } from './items'
import { daysBetween, localDateOf, type Instant, type LocalDate } from './time'

/**
 * What a score means (T108): Urgent (≥ 70) and Soon (45–69) get a chip on a card; Normal and Low
 * show nothing.
 */
export type Tier = 'urgent' | 'soon' | 'normal' | 'low'

/** One line of "Why it's near the top". */
export type ScorePart =
  | { readonly kind: 'base'; readonly priority: Priority; readonly points: number }
  | {
      readonly kind: 'due'
      readonly date: LocalDate
      /** Days until it's due (negative: days past). */
      readonly days: number
      readonly points: number
    }
  | {
      readonly kind: 'feeling'
      readonly by: UserId
      readonly feeling: FeelingKind
      readonly points: number
    }

export type Score = { readonly score: number; readonly tier: Tier; readonly breakdown: ScorePart[] }

export const BASE_POINTS: Readonly<Record<Priority, number>> = {
  low: 10,
  normal: 25,
  high: 45,
  urgent: 70,
}

const OVERDUE = 35

/** Due pressure for something due in `days` days (negative: past due). */
export const duePoints = (days: number): number =>
  days < 0
    ? OVERDUE + Math.min(15, 2 * -days)
    : days === 0
      ? 25
      : days <= 3
        ? 15
        : days <= 7
          ? 5
          : 0

export const tierOf = (score: number): Tier =>
  score >= 70 ? 'urgent' : score >= 45 ? 'soon' : score >= 20 ? 'normal' : 'low'

const dueOf = (item: Item, now: Instant, tz: string): ScorePart | null => {
  if (item.category === 'chore' || !item.when) return null
  const days = daysBetween(localDateOf(now, tz), item.when.date)
  const points = duePoints(days)
  return points ? { kind: 'due', date: item.when.date, days, points } : null
}

/**
 * The item's score (PRD §8.1): base(priority) + due pressure + the house's weight for each
 * member's active feeling (shared since the item was last taken care of), clamped to 0–100, with the breakdown behind it.
 */
export const scorePriority = (
  item: Item,
  feelings: readonly Feeling[],
  weights: FeelingWeights,
  now: Instant,
  tz: string,
): Score => {
  const breakdown: ScorePart[] = [
    { kind: 'base', priority: item.priority, points: BASE_POINTS[item.priority] },
  ]
  const due = dueOf(item, now, tz)
  if (due) breakdown.push(due)
  for (const f of activeFeelings(item, feelings)) {
    breakdown.push({ kind: 'feeling', by: f.by, feeling: f.kind, points: weights[f.kind] })
  }
  const raw = breakdown.reduce((sum, p) => sum + p.points, 0)
  const score = Math.max(0, Math.min(100, raw))
  return { score, tier: tierOf(score), breakdown }
}

// ---- "Why it's near the top" ----------------------------------------------------------------

const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low priority',
  normal: 'Normal priority',
  high: 'High priority',
  urgent: 'Urgent priority',
}

/**
 * The words for one part of the breakdown, never its points (T108): "Normal priority", "Maya is
 * 😰", "Due Friday", "Was due yesterday".
 */
export const describePart = (part: ScorePart, name: (id: UserId) => string): string => {
  switch (part.kind) {
    case 'base':
      return PRIORITY_LABEL[part.priority]
    case 'feeling':
      return `${name(part.by)} is ${FEELING_META[part.feeling].emoji}`
    case 'due':
      if (part.days === 0) return 'Due today'
      if (part.days === 1) return 'Due tomorrow'
      if (part.days === -1) return 'Was due yesterday'
      return `${part.days < 0 ? 'Was due' : 'Due'} ${nearDay(part.date, part.days)}`
  }
}

/** The tier a card shows a chip for (T108): Urgent or Soon; Normal and Low show none. */
export const chipTier = (tier: Tier): 'urgent' | 'soon' | undefined =>
  tier === 'urgent' || tier === 'soon' ? tier : undefined

/** "+25", "−5". */
export const signedPoints = (n: number): string => (n < 0 ? `−${-n}` : `+${n}`)
