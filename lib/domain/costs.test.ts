import { describe, expect, it } from 'vitest'
import {
  activeCosts,
  addCost,
  copiedToSplitwise,
  editCost,
  monthlySpend,
  removeCost,
  splitwiseText,
  type Cost,
} from './costs'
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

  it('leaves removed costs out', () => {
    const costs = [c(4250, '2026-09-02'), { ...c(1000, '2026-09-03'), removedAt: ctx.now }]
    expect(monthlySpend(costs, 2, '2026-09', TZ)).toEqual({ total: 4250, share: 2125 })
    expect(activeCosts(costs).map((x) => x.amount)).toEqual([4250])
  })
})

describe('editCost', () => {
  const item = asId<'item'>('vacuum') as ItemId
  const base: Cost = { ...c(4000, '2026-09-02'), note: 'Groceries', for: { item } }
  const by = { by: wren, actionId: ctx.actionId }

  it('changes the amount, who paid, and the note, and says what changed', () => {
    const r = editCost(base, { amount: 4250 as Cents, paidBy: wren, note: ' Milk ' }, by)
    expect(r.ok && r.value.cost).toEqual({ ...base, amount: 4250, paidBy: wren, note: 'Milk' })
    expect(r.ok && r.value.events).toEqual([
      {
        kind: 'cost.edited',
        costId: base.id,
        itemId: item,
        memberId: wren,
        changes: { amount: [4000, 4250], paid_by: [kavya, wren], note: ['Groceries', 'Milk'] },
        actionId: 'a',
        by: wren,
      },
    ])
  })

  it('clears the note with null or blank, and keeps it when left out', () => {
    for (const note of [null, '  ']) {
      const r = editCost(base, { note }, by)
      expect(r.ok && r.value.cost.note).toBeUndefined()
      expect(r.ok && 'note' in r.value.cost).toBe(false)
      expect(r.ok && r.value.events[0]).toMatchObject({ changes: { note: ['Groceries', null] } })
    }
    const kept = editCost(base, { amount: 1 as Cents }, by)
    expect(kept.ok && kept.value.cost.note).toBe('Groceries')
  })

  it('refuses bad amounts, long notes, no change, and removed costs', () => {
    for (const amount of [0, -1, 2.5]) {
      expect(editCost(base, { amount: amount as Cents }, by)).toEqual({
        ok: false,
        error: 'not_positive',
      })
    }
    expect(editCost(base, { amount: 10_000_001 as Cents }, by)).toEqual({
      ok: false,
      error: 'too_large',
    })
    expect(editCost(base, { note: 'x'.repeat(281) }, by)).toEqual({
      ok: false,
      error: 'note_too_long',
    })
    expect(editCost(base, { amount: 4000 as Cents, note: 'Groceries' }, by)).toEqual({
      ok: false,
      error: 'no_change',
    })
    expect(editCost({ ...base, removedAt: ctx.now }, { amount: 1 as Cents }, by)).toEqual({
      ok: false,
      error: 'removed',
    })
  })
})

describe('removeCost', () => {
  it('marks it removed, once', () => {
    const base: Cost = { ...c(4250, '2026-09-02'), for: { run } }
    const r = removeCost(base, { by: wren, now: ctx.now, actionId: ctx.actionId })
    expect(r.ok && r.value.cost).toEqual({ ...base, removedAt: ctx.now })
    expect(r.ok && r.value.events).toEqual([
      {
        kind: 'cost.removed',
        costId: base.id,
        runId: run,
        memberId: kavya,
        actionId: 'a',
        by: wren,
      },
    ])
    if (!r.ok) return
    expect(removeCost(r.value.cost, { by: wren, now: ctx.now, actionId: ctx.actionId })).toEqual({
      ok: false,
      error: 'already_removed',
    })
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
