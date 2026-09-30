// Money (PRD §6.6): a cost is an amount, who paid, an optional note, and what it was for. It's
// split equally among the house; Splitwise is a copy-and-open, not an API. Pure.

import type { DomainEvent } from './events'
import type { ActionId, CostId, HouseId, ItemId, RunId, UserId } from './ids'
import { formatCents, splitEqually, sumCents, type Cents } from './money'
import { err, ok, type Result } from './result'
import { localDateOf, type Instant } from './time'

export type CostFor = { readonly item: ItemId } | { readonly run: RunId }

export type Cost = {
  readonly id: CostId
  readonly houseId: HouseId
  readonly amount: Cents
  readonly paidBy: UserId
  readonly note?: string
  readonly for?: CostFor
  readonly createdBy: UserId
  readonly createdAt: Instant
}

export const MAX_COST = 10_000_000 as Cents // $100,000
export const MAX_COST_NOTE = 280

export type NewCost = {
  readonly amount: Cents
  readonly paidBy?: UserId
  readonly note?: string
  readonly for?: CostFor
}

/** Records a cost (who paid defaults to whoever's adding it). */
export const addCost = (
  input: NewCost,
  ctx: {
    readonly by: UserId
    readonly now: Instant
    readonly id: CostId
    readonly houseId: HouseId
    readonly actionId: ActionId
  },
): Result<
  { cost: Cost; events: DomainEvent[] },
  'not_positive' | 'too_large' | 'note_too_long'
> => {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) return err('not_positive')
  if (input.amount > MAX_COST) return err('too_large')
  const note = input.note?.trim() || undefined
  if (note && note.length > MAX_COST_NOTE) return err('note_too_long')
  const cost: Cost = {
    id: ctx.id,
    houseId: ctx.houseId,
    amount: input.amount,
    paidBy: input.paidBy ?? ctx.by,
    ...(note && { note }),
    ...(input.for && { for: input.for }),
    createdBy: ctx.by,
    createdAt: ctx.now,
  }
  return ok({
    cost,
    events: [
      {
        kind: 'cost.added',
        costId: cost.id,
        ...(input.for && 'item' in input.for && { itemId: input.for.item }),
        ...(input.for && 'run' in input.for && { runId: input.for.run }),
        memberId: cost.paidBy,
        actionId: ctx.actionId,
        by: ctx.by,
      },
    ],
  })
}

/** "2026-09": the month a cost falls in, on the house's calendar. */
export const monthOf = (at: Instant, tz: string): string => localDateOf(at, tz).slice(0, 7)

/**
 * "Spent this month: $X · your share $Y" (PRD §6.6): the month's total, split equally among the
 * house's members (a share is the larger of the even split when the cents don't divide).
 */
export const monthlySpend = (
  costs: readonly Cost[],
  members: number,
  month: string,
  tz: string,
): { total: Cents; share: Cents } => {
  const total = sumCents(
    costs.filter((c) => monthOf(c.createdAt, tz) === month).map((c) => c.amount),
  )
  return { total, share: splitEqually(total, Math.max(1, members))[0] ?? (0 as Cents) }
}

/** What "Open Splitwise" copies: "Groceries — $42.50". */
export const splitwiseText = (title: string, amount: Cents): string =>
  `${title.trim()} — ${formatCents(amount)}`

/** "Copied for Splitwise" is history only (there's no column for it). */
export const copiedToSplitwise = (
  cost: Cost,
  ctx: { readonly by: UserId; readonly actionId: ActionId },
): DomainEvent => ({
  kind: 'cost.splitwise_copied',
  costId: cost.id,
  ...(cost.for && 'item' in cost.for && { itemId: cost.for.item }),
  ...(cost.for && 'run' in cost.for && { runId: cost.for.run }),
  actionId: ctx.actionId,
  by: ctx.by,
})
