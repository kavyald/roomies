import { describe, expect, it } from 'vitest'
import { addCost, copiedToSplitwise, monthlySpend, splitwiseText, type Cost } from './costs'
import {
  asId,
  type ActionId,
  type CostId,
  type HouseId,
  type ItemId,
  type RunId,
  type UserId,
} from './ids'
import type { Cents } from './money'
import { instantAt, type LocalDate, type LocalTime } from './time'

const TZ = 'America/New_York'
const kavya = asId<'user'>('kavya') as UserId
const wren = asId<'user'>('wren') as UserId
const run = asId<'run'>('groceries') as RunId
const at = (date: string, time = '12:00') => instantAt(date as LocalDate, time as LocalTime, TZ)
const ctx = {
  by: kavya,
  now: at('2026-09-29'),
  id: asId<'cost'>('c') as CostId,
  houseId: asId<'house'>('h') as HouseId,
  actionId: asId<'action'>('a') as ActionId,
}
const c = (amount: number, when: string): Cost => ({
  id: asId<'cost'>(`c${amount}`) as CostId,
  houseId: ctx.houseId,
  amount: amount as Cents,
  paidBy: kavya,
  createdBy: kavya,
  createdAt: when.includes('T') ? at(when.slice(0, 10), when.slice(11)) : at(when),
})

describe('addCost', () => {
  it('records an amount for a run, paid by whoever adds it unless someone else paid', () => {
    const r = addCost({ amount: 4250 as Cents, for: { run }, note: ' Groceries ' }, ctx)
    expect(r.ok && r.value.cost).toEqual({
      id: 'c',
      houseId: 'h',
      amount: 4250,
      paidBy: kavya,
      note: 'Groceries',
      for: { run },
      createdBy: kavya,
      createdAt: ctx.now,
    })
    expect(r.ok && r.value.events).toEqual([
      { kind: 'cost.added', costId: 'c', runId: run, memberId: kavya, actionId: 'a', by: kavya },
    ])
    const item = asId<'item'>('vacuum') as ItemId
    const paid = addCost({ amount: 18900 as Cents, paidBy: wren, for: { item } }, ctx)
    expect(paid.ok && paid.value.events[0]).toMatchObject({ itemId: item, memberId: wren })
  })

  it('refuses zero, negative, huge, or fractional amounts, and long notes', () => {
    for (const amount of [0, -100, 1.5]) {
      expect(addCost({ amount: amount as Cents }, ctx)).toEqual({
        ok: false,
        error: 'not_positive',
      })
    }
    expect(addCost({ amount: 10_000_001 as Cents }, ctx)).toEqual({ ok: false, error: 'too_large' })
    expect(addCost({ amount: 100 as Cents, note: 'x'.repeat(281) }, ctx)).toEqual({
      ok: false,
      error: 'note_too_long',
    })
  })
})

describe('monthlySpend', () => {
  it('adds up this month on the house calendar, and splits it equally', () => {
    const costs = [
      c(4250, '2026-09-02'),
      c(1000, '2026-09-30T23:30'), // late on the 30th in New York is October in UTC
      c(999, '2026-10-01'),
      c(5000, '2026-08-31'),
    ]
    expect(monthlySpend(costs, 4, '2026-09', TZ)).toEqual({ total: 5250, share: 1313 })
    expect(monthlySpend([], 4, '2026-09', TZ)).toEqual({ total: 0, share: 0 })
    expect(monthlySpend(costs, 0, '2026-10', TZ)).toEqual({ total: 999, share: 999 })
  })
})

describe('Splitwise', () => {
  it('copies "{title} — ${amount}" and records only that it was copied', () => {
    expect(splitwiseText(' Groceries ', 4250 as Cents)).toBe('Groceries — $42.50')
    const r = addCost({ amount: 4250 as Cents, for: { run } }, ctx)
    expect(r.ok && copiedToSplitwise(r.value.cost, { by: wren, actionId: ctx.actionId })).toEqual({
      kind: 'cost.splitwise_copied',
      costId: 'c',
      runId: run,
      actionId: 'a',
      by: wren,
    })
  })
})
