import { describe, expect, it } from 'vitest'
import { DEFAULT_FEELING_WEIGHTS, type Feeling, type FeelingKind } from './feelings'
import { asId, type HouseId, type ItemId, type UserId } from './ids'
import type { Chore, Item, Need, Priority, Task } from './items'
import { chipTier, describePart, duePoints, scorePriority, signedPoints, tierOf } from './priority'
import { instantAt, type LocalDate, type LocalTime } from './time'

const TZ = 'America/New_York'
const NOW = instantAt('2026-09-29' as LocalDate, '12:00' as LocalTime, TZ) // Tue
const day = (offset: number): LocalDate => {
  const d = new Date(Date.UTC(2026, 8, 29 + offset))
  return d.toISOString().slice(0, 10) as LocalDate
}
const at = (offset: number) => instantAt(day(offset), '09:00' as LocalTime, TZ)

const me = asId<'user'>('me') as UserId
const maya = asId<'user'>('maya') as UserId
const base = (title: string) => ({
  id: asId<'item'>(title) as ItemId,
  houseId: asId<'house'>('h') as HouseId,
  title,
  priority: 'normal' as Priority,
  createdBy: me,
  createdAt: at(-30),
})
const task = (title: string, o: Partial<Task> = {}): Task => ({
  ...base(title),
  category: 'task',
  ...o,
})
const need = (title: string, o: Partial<Need> = {}): Need => ({
  ...base(title),
  category: 'need',
  ...o,
})
const chore = (title: string, o: Partial<Chore> = {}): Chore => ({
  ...base(title),
  category: 'chore',
  kind: 'upkeep',
  rooms: [],
  ...o,
})
const felt = (item: Item, kind: FeelingKind, by: UserId = maya): Feeling => ({
  itemId: item.id,
  by,
  kind,
  at: NOW,
})
const score = (item: Item, feelings: Feeling[] = []) =>
  scorePriority(item, feelings, DEFAULT_FEELING_WEIGHTS, NOW, TZ).score

describe('scorePriority (PRD §8.1)', () => {
  it.each<[string, Item, Feeling[] | ((i: Item) => Feeling[]), number]>([
    ['low, no date', task('a', { priority: 'low' }), [], 10],
    ['normal, no date', task('a'), [], 25],
    ['high, no date', task('a', { priority: 'high' }), [], 45],
    ['urgent, no date', task('a', { priority: 'urgent' }), [], 70],
    ['due today', task('a', { when: { date: day(0) } }), [], 50],
    [
      'due today, with a time already past',
      task('a', { when: { date: day(0), time: '08:00' as LocalTime } }),
      [],
      50,
    ],
    ['due tomorrow', task('a', { when: { date: day(1) } }), [], 40],
    ['due in 3 days', task('a', { when: { date: day(3) } }), [], 40],
    ['due in 4 days', task('a', { when: { date: day(4) } }), [], 30],
    ['due in 7 days', task('a', { when: { date: day(7) } }), [], 30],
    ['due in 8 days', task('a', { when: { date: day(8) } }), [], 25],
    ['1 day past', task('a', { when: { date: day(-1) } }), [], 62],
    ['3 days past', task('a', { when: { date: day(-3) } }), [], 66],
    ['8 days past (extra capped at +15)', task('a', { when: { date: day(-8) } }), [], 75],
    ['30 days past', task('a', { when: { date: day(-30) } }), [], 75],
    ['😰 anxious', task('a'), (i) => [felt(i, 'anxious')], 45],
    [
      '😰 + 😤 from two people',
      task('a'),
      (i) => [felt(i, 'anxious'), felt(i, 'frustrated', me)],
      60,
    ],
    ['😌 lowers it', task('a', { priority: 'low' }), (i) => [felt(i, 'meh')], 5],
    [
      'never below 0',
      task('a', { priority: 'low' }),
      (i) => [felt(i, 'meh'), felt(i, 'meh', me)],
      0,
    ],
    [
      'never above 100',
      task('a', { priority: 'urgent', when: { date: day(-9) } }),
      (i) => [felt(i, 'anxious')],
      100,
    ],
    ['a chore has no due pressure', chore('c', { lastDone: { at: at(-30), by: me } }), [], 25],
    ['need needed by tomorrow', need('n', { when: { date: day(1) } }), [], 40],
  ])('%s → %i', (_, item, feelings, expected) => {
    expect(score(item, typeof feelings === 'function' ? feelings(item) : feelings)).toBe(expected)
  })

  it('clamps to 0–100 (a raw score of −30 is 0)', () => {
    const a = task('a', { priority: 'low' })
    const weights = { ...DEFAULT_FEELING_WEIGHTS, meh: -20 }
    const s = scorePriority(a, [felt(a, 'meh'), felt(a, 'meh', me)], weights, NOW, TZ)
    expect(s).toMatchObject({ score: 0, tier: 'low' })
    expect(s.breakdown.reduce((n, p) => n + p.points, 0)).toBe(-30)
  })

  it('uses the house weights, and only counts feelings about this item', () => {
    const a = task('a')
    const b = task('b')
    const weights = { ...DEFAULT_FEELING_WEIGHTS, anxious: 40 }
    expect(scorePriority(a, [felt(a, 'anxious'), felt(b, 'anxious')], weights, NOW, TZ).score).toBe(
      65,
    )
  })

  it('explains itself', () => {
    const a = task('a', { when: { date: day(1) } })
    const s = scorePriority(a, [felt(a, 'anxious')], DEFAULT_FEELING_WEIGHTS, NOW, TZ)
    const name = (id: UserId) => (id === maya ? 'Maya' : 'Someone')
    expect(s.breakdown.map((p) => describePart(p, name))).toEqual([
      'Normal priority',
      'Due tomorrow',
      'Maya is 😰',
    ])
    expect(s).toMatchObject({ score: 60, tier: 'soon' })
  })
})

describe('tiers', () => {
  it.each([
    [100, 'urgent'],
    [70, 'urgent'],
    [69, 'soon'],
    [45, 'soon'],
    [44, 'normal'],
    [20, 'normal'],
    [19, 'low'],
    [0, 'low'],
  ])('%i is %s', (n, tier) => expect(tierOf(n)).toBe(tier))

  it('only Urgent and Soon get a chip (T108)', () => {
    expect((['urgent', 'soon', 'normal', 'low'] as const).map(chipTier)).toEqual([
      'urgent',
      'soon',
      undefined,
      undefined,
    ])
  })
})

describe('due pressure', () => {
  it('rises as the date gets closer, and keeps rising (a little) once past', () => {
    expect([8, 7, 4, 3, 1, 0, -1, -2, -7, -8, -20].map(duePoints)).toEqual([
      0, 5, 5, 15, 15, 25, 37, 39, 49, 50, 50,
    ])
  })
})

describe('describePart', () => {
  const name = () => 'Wren'
  const due = (days: number) =>
    describePart({ kind: 'due', date: day(days), days, points: 0 }, name)
  it('reads kindly, in words, about the item and never the person (T108)', () => {
    // Today is Tuesday Sep 29.
    expect([due(-9), due(-1), due(-3), due(0), due(1), due(3), due(10)]).toEqual([
      'Was due Sep 20',
      'Was due yesterday',
      'Was due Saturday',
      'Due today',
      'Due tomorrow',
      'Due Friday',
      'Due Oct 9',
    ])
    expect(describePart({ kind: 'base', priority: 'urgent', points: 70 }, name)).toBe(
      'Urgent priority',
    )
    expect(
      describePart({ kind: 'feeling', by: maya, feeling: 'frustrated', points: 15 }, name),
    ).toBe('Wren is 😤')
    expect(signedPoints(-5)).toBe('−5')
    for (const s of [due(-9)]) expect(s).not.toMatch(/overdue|failed|missed/i)
  })
})
