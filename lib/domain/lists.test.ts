import { describe, expect, it } from 'vitest'
import { asId, type ContactId, type HouseId, type ItemId, type UserId } from './ids'
import type { Item, Task } from './items'
import {
  choreLateness,
  choreList,
  daysAgo,
  daysSinceDone,
  isChoreDue,
  needList,
  taskList,
} from './lists'
import type { Chore } from './items'
import { instantAt, MS_PER_DAY, plusMs } from './time'
import { instant, type LocalDate, type LocalTime } from './time'

const me = asId<'user'>('me') as UserId
const you = asId<'user'>('you') as UserId
const t = (title: string, o: Partial<Task> = {}, created = 0): Task => ({
  id: asId<'item'>(title) as ItemId,
  houseId: asId<'house'>('h') as HouseId,
  category: 'task',
  title,
  priority: 'normal',
  createdBy: me,
  createdAt: instant(created),
  ...o,
})

const items: Item[] = [
  t('Undated old', {}, 1),
  t('Undated new', { assignee: me }, 2),
  t('Thu 10:00', {
    when: { date: '2026-10-01' as LocalDate, time: '10:00' as LocalTime },
    contactId: asId<'contact'>('super') as ContactId,
  }),
  t('Thu any time', { when: { date: '2026-10-01' as LocalDate }, assignee: you }),
  t('Wed', { when: { date: '2026-09-30' as LocalDate }, assignee: me }),
  t('Done', { done: { at: instant(5), by: me } }),
  t('Archived', { archivedAt: instant(5) }),
  { ...t('A need'), category: 'need' } as Item,
]

describe('taskList', () => {
  it('lists open tasks: dated soonest first, then undated newest first', () => {
    expect(taskList(items, 'all', me).map((x) => x.title)).toEqual([
      'Wed',
      'Thu 10:00',
      'Thu any time',
      'Undated new',
      'Undated old',
    ])
  })

  it('filters to mine and to outside help', () => {
    expect(taskList(items, 'mine', me).map((x) => x.title)).toEqual(['Wed', 'Undated new'])
    expect(taskList(items, 'outside', me).map((x) => x.title)).toEqual(['Thu 10:00'])
  })
})

describe('needList', () => {
  const n = (title: string, o: Partial<Task> = {}, created = 0) =>
    ({ ...t(title, o, created), category: 'need' }) as Item
  const needs: Item[] = [
    n('Old', {}, 1),
    n('New', {}, 3),
    n('By Friday', { when: { date: '2026-10-02' as LocalDate } }),
    n('By Wednesday', { when: { date: '2026-09-30' as LocalDate } }),
    n('Got it', { done: { at: instant(5), by: me } } as never),
    n('Anxious about', {}, 0),
  ]

  it('puts needs with a feeling first, then needed-by, then newest', () => {
    const score = (id: string) => (id === 'Anxious about' ? 20 : 0)
    expect(needList(needs, score as never).map((x) => x.title)).toEqual([
      'Anxious about',
      'By Wednesday',
      'By Friday',
      'New',
      'Old',
    ])
    expect(needList(needs).map((x) => x.title)).toEqual([
      'By Wednesday',
      'By Friday',
      'New',
      'Old',
      'Anxious about',
    ])
  })
})

describe('chores', () => {
  const NY = 'America/New_York'
  const now = instantAt('2026-09-29' as LocalDate, '12:00' as LocalTime, NY)
  const ago = (days: number) => ({ at: plusMs(now, -days * MS_PER_DAY), by: me })
  const c = (title: string, repeatDays: number | null, lastDoneDays?: number): Chore =>
    ({
      ...t(title),
      category: 'chore',
      repeatDays,
      ...(lastDoneDays !== undefined && { lastDone: ago(lastDoneDays) }),
    }) as Chore

  const chores = [
    c('Weekly, 3 days ago', 7, 3),
    c('Weekly, 9 days ago', 7, 9),
    c('As needed, long ago', null, 30),
    c('Every 3 days, 4 ago', 3, 4),
    c('As needed, recent', null, 1),
    c('As needed, never', null),
  ]

  it('puts the chore furthest past its rhythm first, and as-needed ones last', () => {
    expect(choreList(chores, now, NY).map((x) => x.title)).toEqual([
      'Every 3 days, 4 ago', // 4/3
      'Weekly, 9 days ago', // 9/7
      'Weekly, 3 days ago',
      'As needed, never',
      'As needed, long ago',
      'As needed, recent',
    ])
  })

  it('an every-7-days chore last done 9 days ago is due; doing it today resets it', () => {
    const late = c('Trash', 7, 9)
    expect(daysSinceDone(late, now, NY)).toBe(9)
    expect(isChoreDue(late, now, NY)).toBe(true)
    const reset = { ...late, lastDone: { at: now, by: me } }
    expect(isChoreDue(reset, now, NY)).toBe(false)
    expect(choreList([c('Other', 7, 8), reset], now, NY).map((x) => x.title)).toEqual([
      'Other',
      'Trash',
    ])
  })

  it('never-done repeating chores rank first; as-needed chores are never "due"', () => {
    expect(choreLateness(c('New', 7), now, NY)).toBe(Number.POSITIVE_INFINITY)
    expect(isChoreDue(c('Descale', null, 100), now, NY)).toBe(false)
  })

  it('says how long ago plainly', () => {
    expect([0, 1, 9].map(daysAgo)).toEqual(['today', 'yesterday', '9 days ago'])
  })
})
