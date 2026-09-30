// Priority and the Home feed (PRD §8.1, ARCHITECTURE §7.1). Pure: weights, `now` and the house's
// time zone are arguments, so the feed, jobs and tests all score the same way.

import { FEELING_META, type Feeling, type FeelingKind, type FeelingWeights } from './feelings'
import type { UserId } from './ids'
import type { Item, Priority } from './items'
import { daysSinceDone, isChoreDue } from './lists'
import { daysBetween, localDateOf, type Instant, type LocalDate } from './time'

export type Tier = 'top' | 'high' | 'normal' | 'low'

/** One line of "Why is this here?". */
export type ScorePart =
  | { readonly kind: 'base'; readonly priority: Priority; readonly points: number }
  | {
      readonly kind: 'due'
      /** Days until it's due (negative: days past). For a chore, measured against its rhythm. */
      readonly days: number
      readonly chore: boolean
      /** A repeating chore nobody has done yet. */
      readonly neverDone?: boolean
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
  score >= 70 ? 'top' : score >= 45 ? 'high' : score >= 20 ? 'normal' : 'low'

const dueOf = (item: Item, now: Instant, tz: string): ScorePart | null => {
  if (item.category === 'chore') {
    if (!item.repeatDays) return null
    const since = daysSinceDone(item, now, tz)
    // A repeating chore nobody has done yet is already past its rhythm (it's in the feed, T21).
    if (since === null)
      return { kind: 'due', days: 0, chore: true, neverDone: true, points: OVERDUE }
    const days = item.repeatDays - since
    const points = duePoints(days)
    return points ? { kind: 'due', days, chore: true, points } : null
  }
  if (!item.when) return null
  const days = daysBetween(localDateOf(now, tz), item.when.date)
  const points = duePoints(days)
  return points ? { kind: 'due', days, chore: false, points } : null
}

/**
 * The item's score (PRD §8.1): base(priority) + due pressure + the house's weight for each
 * member's current feeling, clamped to 0–100, with the breakdown behind it.
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
  for (const f of feelings) {
    if (f.itemId !== item.id) continue
    breakdown.push({ kind: 'feeling', by: f.by, feeling: f.kind, points: weights[f.kind] })
  }
  const raw = breakdown.reduce((sum, p) => sum + p.points, 0)
  const score = Math.max(0, Math.min(100, raw))
  return { score, tier: tierOf(score), breakdown }
}

/**
 * Whether an item belongs in Needs attention (PRD §8.1): open tasks, except ones on a visit
 * (back only with a feeling or the visit within 3 days); chores past their rhythm or with a
 * feeling; needs with a feeling or needed within 7 days.
 */
export const isInFeed = (
  item: Item,
  feelings: readonly Feeling[],
  now: Instant,
  tz: string,
  opts: { visitDate?: (item: Item) => LocalDate | undefined } = {},
): boolean => {
  if (item.archivedAt) return false
  if (item.category !== 'chore' && item.done) return false
  const felt = feelings.some((f) => f.itemId === item.id)
  const today = localDateOf(now, tz)
  switch (item.category) {
    case 'task': {
      if (item.run?.kind !== 'visit') return true
      if (felt) return true
      const visit = opts.visitDate?.(item)
      return !!visit && daysBetween(today, visit) <= 3
    }
    case 'chore':
      return felt || isChoreDue(item, now, tz)
    case 'need':
      return felt || (!!item.when && daysBetween(today, item.when.date) <= 7)
  }
}

export type FeedFilter = 'mine' | 'all'
export type FeedEntry = { readonly item: Item } & Score

/**
 * Needs attention: what's in the feed, highest score first; ties go to the sooner date, then the
 * newest. Mine = assigned to me.
 */
export const homeFeed = (
  items: readonly Item[],
  feelingsOf: (item: Item) => readonly Feeling[],
  ctx: {
    weights: FeelingWeights
    now: Instant
    tz: string
    filter: FeedFilter
    me: UserId
    visitDate?: (item: Item) => LocalDate | undefined
  },
): FeedEntry[] =>
  items
    .filter((i) => ctx.filter === 'all' || i.assignee === ctx.me)
    .filter((i) => isInFeed(i, feelingsOf(i), ctx.now, ctx.tz, { visitDate: ctx.visitDate }))
    .map((item) => ({
      item,
      ...scorePriority(item, feelingsOf(item), ctx.weights, ctx.now, ctx.tz),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      const da = a.item.when?.date
      const db = b.item.when?.date
      if (da && db && da !== db) return da.localeCompare(db)
      if (da && !db) return -1
      if (db && !da) return 1
      return b.item.createdAt.epochMs - a.item.createdAt.epochMs
    })

// ---- "Why is this here?" -------------------------------------------------------------------

const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low priority',
  normal: 'Normal priority',
  high: 'High priority',
  urgent: 'Urgent',
}

const dayCount = (n: number) => (n === 1 ? '1 day' : `${n} days`)

/** The words for one part of the breakdown, without its points ("Due tomorrow", "😰 Maya"). */
export const describePart = (part: ScorePart, name: (id: UserId) => string): string => {
  switch (part.kind) {
    case 'base':
      return PRIORITY_LABEL[part.priority]
    case 'feeling':
      return `${FEELING_META[part.feeling].emoji} ${name(part.by)}`
    case 'due':
      if (part.chore) {
        if (part.neverDone) return 'Not done yet'
        if (part.days < 0) return `${dayCount(-part.days)} past its rhythm`
        if (part.days === 0) return 'Due for a turn today'
        return `Due for a turn in ${dayCount(part.days)}`
      }
      if (part.days < 0)
        return part.days === -1 ? 'Was due yesterday' : `Was due ${dayCount(-part.days)} ago`
      if (part.days === 0) return 'Due today'
      if (part.days === 1) return 'Due tomorrow'
      return `Due in ${dayCount(part.days)}`
  }
}

/** "+25", "−5". */
export const signedPoints = (n: number): string => (n < 0 ? `−${-n}` : `+${n}`)
