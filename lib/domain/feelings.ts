import type { DomainEvent, StoredActivityRow } from './events'
import type { ActionId, ItemId, UserId } from './ids'
import { err, ok, type Result } from './result'
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

// ---- sharing a feeling (PRD §7) ------------------------------------------------------------------

export const FEELING_META: Record<FeelingKind, { emoji: string; label: string; blurb: string }> = {
  anxious: { emoji: '😰', label: 'Anxious', blurb: 'This is stressing me out' },
  frustrated: { emoji: '😤', label: 'Frustrated', blurb: 'This keeps happening' },
  confused: { emoji: '😕', label: 'Confused', blurb: "I don't get what's going on" },
  fine: { emoji: '🙂', label: 'Fine', blurb: 'Just so you know' },
  meh: { emoji: '😌', label: 'Not a big deal', blurb: "Don't rush on my account" },
  thanks: { emoji: '🙏', label: 'Thanks', blurb: 'Appreciate it' },
}

export const MAX_FEELING_NOTE = 280

/**
 * Sets, changes, or removes my feeling about an item. The event carries the previous feeling, so
 * "Earlier" can be read back from the activity log.
 */
export const setFeeling = (
  current: Feeling | null,
  next: { kind: FeelingKind; note?: string } | null,
  ctx: { itemId: ItemId; by: UserId; now: Instant; actionId: ActionId },
): Result<{ feeling: Feeling | null; events: DomainEvent[] }, 'no_change' | 'note_too_long'> => {
  if (next === null) {
    if (!current) return err('no_change')
    return ok({
      feeling: null,
      events: [
        {
          kind: 'feeling.removed',
          itemId: ctx.itemId,
          changes: { previous: current },
          actionId: ctx.actionId,
          by: ctx.by,
        },
      ],
    })
  }
  const note = next.note?.trim() || undefined
  if (note && note.length > MAX_FEELING_NOTE) return err('note_too_long')
  if (current && current.kind === next.kind && current.note === note) return err('no_change')
  const feeling: Feeling = {
    itemId: ctx.itemId,
    by: ctx.by,
    kind: next.kind,
    ...(note && { note }),
    at: ctx.now,
  }
  return ok({
    feeling,
    events: [
      {
        kind: 'feeling.set',
        itemId: ctx.itemId,
        changes: { previous: current, next: feeling },
        actionId: ctx.actionId,
        by: ctx.by,
      },
    ],
  })
}

/**
 * The Earlier list for an item: each feeling that was replaced or removed, newest first, read from
 * the item's activity rows (§6.4 "Earlier feelings on an item").
 */
export const earlierFeelings = (rows: readonly StoredActivityRow[]): Feeling[] =>
  rows
    .filter((r) => r.kind === 'feeling.set' || r.kind === 'feeling.removed')
    .sort((a, b) => b.id - a.id)
    .map((r) => (r.changes as { previous?: Feeling | null } | undefined)?.previous)
    .filter((f): f is Feeling => !!f)

/** The sum of the house's weights for an item's current feelings (PRD §8.1). */
export const feelingScore = (feelings: readonly Feeling[], weights: FeelingWeights): number =>
  feelings.reduce((sum, f) => sum + weights[f.kind], 0)

/** "😰 1 · 🙏 2": emoji with counts, strongest first. */
export const feelingCounts = (
  feelings: readonly Feeling[],
): { kind: FeelingKind; count: number }[] =>
  FEELING_KINDS.map((kind) => ({
    kind,
    count: feelings.filter((f) => f.kind === kind).length,
  })).filter((c) => c.count > 0)
