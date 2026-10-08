import { describe, expect, it } from 'vitest'
import { byDay, calendarEntries, comingUp, monthGrid, monthRange, shiftMonth } from './calendar'
import { asId, type ContactId, type HouseId, type ItemId, type RunId, type UserId } from './ids'
import type { Item } from './items'
import type { Run } from './runs'
import { instant, type LocalDate, type LocalTime } from './time'

const me = asId<'user'>('me') as UserId
const house = asId<'house'>('h') as HouseId
const d = (s: string) => s as LocalDate
const item = (title: string, o: Partial<Item> & Pick<Item, 'category'>): Item =>
  ({
    id: asId<'item'>(title) as ItemId,
    houseId: house,
    title,
    priority: 'normal',
    createdBy: me,
    createdAt: instant(0),
    ...(o.category === 'chore' && { repeatDays: 7 }),
    ...o,
  }) as Item
const run = (id: string, o: Partial<Run>): Run =>
  ({
    id: asId<'run'>(id) as RunId,
    houseId: house,
    runner: me,
    createdBy: me,
    createdAt: instant(0),
    kind: 'batch',
    state: { open: true },
    ...o,
  }) as Run

const items: Item[] = [
  item('Leak', { category: 'task', when: { date: d('2026-10-01'), time: '10:00' as LocalTime } }),
  item('Paint', { category: 'task', when: { date: d('2026-10-01') } }),
  item('Milk', { category: 'need', when: { date: d('2026-09-30') } }),
  item('Done', {
    category: 'task',
    when: { date: d('2026-09-30') },
    done: { at: instant(0), by: me },
  }),
  item('Gone', { category: 'need', when: { date: d('2026-09-30') }, archivedAt: instant(0) }),
  item('Later', { category: 'task', when: { date: d('2026-10-20') } }),
  item('Undated', { category: 'task' }),
  item('Mop', { category: 'chore' }),
]
const runs: Run[] = [
  run('saturday', { title: 'Groceries', when: { date: d('2026-10-03') } }),
  run('visit', {
    kind: 'visit',
    contactId: asId<'contact'>('super') as ContactId,
    when: { date: d('2026-10-01'), time: '09:00' as LocalTime },
  }),
  run('finished', {
    when: { date: d('2026-10-02') },
    state: { open: false, finishedAt: instant(0) },
  }),
  run('undated', {}),
]

const names = (xs: ReturnType<typeof calendarEntries>) =>
  xs.map((e) => (e.kind === 'item' ? e.item.title : (e.run.title ?? e.run.id)))

describe('calendar', () => {
  it('shows open dated tasks, needs, and runs, by day then time (date-only after timed)', () => {
    expect(names(calendarEntries(items, runs, d('2026-09-01'), d('2026-10-31')))).toEqual([
      'Milk',
      'visit',
      'Leak',
      'Paint',
      'Groceries',
      'Later',
    ])
  })

  it('Coming up is today and the next six days', () => {
    expect(names(comingUp(items, runs, d('2026-09-30')))).toEqual([
      'Milk',
      'visit',
      'Leak',
      'Paint',
      'Groceries',
    ])
    expect(names(comingUp(items, runs, d('2026-10-14')))).toEqual(['Later'])
  })

  it('groups by day', () => {
    const days = byDay(calendarEntries(items, runs, d('2026-09-01'), d('2026-10-31')))
    expect(names(days.get(d('2026-10-01'))!)).toEqual(['visit', 'Leak', 'Paint'])
    expect(days.has(d('2026-10-02'))).toBe(false)
  })

  it('lays a month out in Sunday-first weeks', () => {
    const grid = monthGrid('2026-10') // Oct 1, 2026 is a Thursday
    expect(grid[0]).toEqual([
      null,
      null,
      null,
      null,
      d('2026-10-01'),
      d('2026-10-02'),
      d('2026-10-03'),
    ])
    expect(grid.at(-1)).toEqual([
      d('2026-10-25'),
      d('2026-10-26'),
      d('2026-10-27'),
      d('2026-10-28'),
      d('2026-10-29'),
      d('2026-10-30'),
      d('2026-10-31'),
    ])
    expect(grid).toHaveLength(5)
    expect(monthGrid('2026-02').flat().filter(Boolean)).toHaveLength(28)
    expect(monthRange('2024-02')).toEqual({ first: '2024-02-01', last: '2024-02-29' })
    expect(monthRange('2026-12')).toEqual({ first: '2026-12-01', last: '2026-12-31' })
    expect([shiftMonth('2026-12', 1), shiftMonth('2026-01', -1), shiftMonth('2026-09', 2)]).toEqual(
      ['2027-01', '2025-12', '2026-11'],
    )
  })
})

describe('calendar across daylight saving', () => {
  it("Coming up counts the house's days, even across the fall-back and spring-forward nights", async () => {
    const { instantAt, localDateOf } = await import('./time')
    const tz = 'America/New_York'
    // 11:30pm on Sat Oct 31 (EDT) is still Oct 31 at home, though it's Nov 1 in UTC.
    const lateSat = instantAt(d('2026-10-31'), '23:30' as LocalTime, tz)
    expect(localDateOf(lateSat, tz)).toBe('2026-10-31')
    const fallBack: Item[] = [
      item('Clocks', {
        category: 'task',
        when: { date: d('2026-11-01'), time: '01:30' as LocalTime },
      }),
      item('After', { category: 'task', when: { date: d('2026-11-06') } }),
      item('Too far', { category: 'task', when: { date: d('2026-11-07') } }),
    ]
    expect(names(comingUp(fallBack, [], localDateOf(lateSat, tz)))).toEqual(['Clocks', 'After'])
    // The spring-forward day is one calendar day like any other.
    const spring: Item[] = [
      item('Brunch', {
        category: 'task',
        when: { date: d('2027-03-14'), time: '02:30' as LocalTime },
      }),
    ]
    const sat = instantAt(d('2027-03-13'), '12:00' as LocalTime, tz)
    expect(names(comingUp(spring, [], localDateOf(sat, tz)))).toEqual(['Brunch'])
    expect(byDay(comingUp(spring, [], localDateOf(sat, tz))).has(d('2027-03-14'))).toBe(true)
  })
})
