import { describe, expect, it } from 'vitest'
import { DEFAULT_FEELING_WEIGHTS, type Feeling, type FeelingKind } from './feelings'
import { asId, type HouseId, type ItemId, type RunId, type UserId } from './ids'
import type { Chore, Item, Need, Priority, Task } from './items'
import {
  describePart,
  duePoints,
  homeFeed,
  isInFeed,
  scorePriority,
  signedPoints,
  tierOf,
} from './priority'
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
  repeatDays: 7,
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
    ['chore 2 days past every 7', chore('c', { lastDone: { at: at(-9), by: me } }), [], 64],
    ['chore due for a turn today', chore('c', { lastDone: { at: at(-7), by: me } }), [], 50],
    ['chore 2 days from its turn', chore('c', { lastDone: { at: at(-5), by: me } }), [], 40],
    [
      'chore done today (its next turn is 7 days away)',
      chore('c', { lastDone: { at: at(0), by: me } }),
      [],
      30,
    ],
    ['repeating chore never done', chore('c'), [], 60],
    ['as-needed chore has no due pressure', chore('c', { repeatDays: null }), [], 25],
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
    expect(s.breakdown.map((p) => `${describePart(p, name)} ${signedPoints(p.points)}`)).toEqual([
      'Normal priority +25',
      'Due tomorrow +15',
      '😰 Maya +20',
    ])
    expect(s).toMatchObject({ score: 60, tier: 'high' })
  })
})

describe('tiers', () => {
  it.each([
    [100, 'top'],
    [70, 'top'],
    [69, 'high'],
    [45, 'high'],
    [44, 'normal'],
    [20, 'normal'],
    [19, 'low'],
    [0, 'low'],
  ])('%i is %s', (n, tier) => expect(tierOf(n)).toBe(tier))
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
  const due = (days: number, chore = false, neverDone = false) =>
    describePart({ kind: 'due', days, chore, neverDone, points: 0 }, name)
  it('reads kindly, about the item and never the person', () => {
    expect([due(-1), due(-3), due(0), due(1), due(5)]).toEqual([
      'Was due yesterday',
      'Was due 3 days ago',
      'Due today',
      'Due tomorrow',
      'Due in 5 days',
    ])
    expect([due(-1, true), due(-2, true), due(0, true), due(1, true), due(3, true)]).toEqual([
      '1 day past its rhythm',
      '2 days past its rhythm',
      'Due for a turn today',
      'Due for a turn in 1 day',
      'Due for a turn in 3 days',
    ])
    expect(due(0, true, true)).toBe('Not done yet')
    expect(describePart({ kind: 'base', priority: 'urgent', points: 70 }, name)).toBe('Urgent')
    expect(signedPoints(-5)).toBe('−5')
    for (const s of [due(-9), due(-9, true)]) expect(s).not.toMatch(/overdue|failed|missed/i)
  })
})

describe('isInFeed', () => {
  const inFeed = (item: Item, feelings: Feeling[] = [], visit?: LocalDate) =>
    isInFeed(item, feelings, NOW, TZ, { visitDate: () => visit })

  it('includes open tasks, but not done or archived ones', () => {
    expect(inFeed(task('a'))).toBe(true)
    expect(inFeed(task('a', { done: { at: NOW, by: me } }))).toBe(false)
    expect(inFeed(task('a', { archivedAt: NOW }))).toBe(false)
  })

  it('leaves out tasks on a visit, unless someone has a feeling or the visit is within 3 days', () => {
    const onVisit = task('a', { run: { id: asId<'run'>('r') as RunId, kind: 'visit' } })
    expect(inFeed(onVisit)).toBe(false)
    expect(inFeed(onVisit, [], day(5))).toBe(false)
    expect(inFeed(onVisit, [], day(3))).toBe(true)
    expect(inFeed(onVisit, [felt(onVisit, 'confused')])).toBe(true)
    const onRequest = task('b', { run: { id: asId<'run'>('r') as RunId, kind: 'request' } })
    expect(inFeed(onRequest)).toBe(true)
  })

  it('includes chores past their rhythm, or with a feeling', () => {
    expect(inFeed(chore('c', { lastDone: { at: at(-8), by: me } }))).toBe(true)
    expect(inFeed(chore('c', { lastDone: { at: at(-7), by: me } }))).toBe(false)
    expect(inFeed(chore('c', { lastDone: { at: at(-2), by: me } }))).toBe(false)
  })

  it('shows an as-needed chore only once someone shares a feeling', () => {
    const c = chore('Descale the kettle', { repeatDays: null })
    expect(inFeed(c)).toBe(false)
    expect(inFeed(c, [felt(c, 'fine')])).toBe(true)
  })

  it('includes needs with a feeling or needed within 7 days', () => {
    expect(inFeed(need('n'))).toBe(false)
    expect(inFeed(need('n', { when: { date: day(7) } }))).toBe(true)
    expect(inFeed(need('n', { when: { date: day(8) } }))).toBe(false)
    expect(inFeed(need('n', { when: { date: day(-2) } }))).toBe(true)
    const n = need('n')
    expect(inFeed(n, [felt(n, 'anxious')])).toBe(true)
    expect(inFeed(need('n', { done: { at: NOW, by: me } }), [felt(n, 'anxious')])).toBe(false)
  })
})

describe('homeFeed', () => {
  const items: Item[] = [
    task('Undated', { createdAt: at(-3) }),
    task('Newer undated', { createdAt: at(-1) }),
    task('Leak', { when: { date: day(-1) }, assignee: me }),
    task('Thursday', { when: { date: day(2) } }),
    task('Friday', { when: { date: day(3) } }),
    chore('Descale', { repeatDays: null }),
    need('Toilet paper'),
  ]
  const feelings = [felt(items[6]!, 'anxious'), felt(items[6]!, 'frustrated', me)]
  const feed = (filter: 'mine' | 'all', weights = DEFAULT_FEELING_WEIGHTS) =>
    homeFeed(items, (i) => feelings.filter((f) => f.itemId === i.id), {
      weights,
      now: NOW,
      tz: TZ,
      filter,
      me,
    })

  it('ranks by score; ties go to the sooner date, then the newest', () => {
    expect(feed('all').map((e) => `${e.item.title} ${e.score}`)).toEqual([
      'Leak 62',
      'Toilet paper 60',
      'Thursday 40',
      'Friday 40',
      'Newer undated 25',
      'Undated 25',
    ])
  })

  it('re-ranks when the weights change', () => {
    const calm = { ...DEFAULT_FEELING_WEIGHTS, anxious: 0, frustrated: 0 }
    expect(feed('all', calm)[0]!.item.title).toBe('Leak')
    expect(feed('all', calm).find((e) => e.item.title === 'Toilet paper')!.score).toBe(25)
  })

  it('Mine shows only what is assigned to me', () => {
    expect(feed('mine').map((e) => e.item.title)).toEqual(['Leak'])
  })
})
