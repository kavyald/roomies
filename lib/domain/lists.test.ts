import { describe, expect, it } from 'vitest'
import { asId, type ContactId, type HouseId, type ItemId, type UserId } from './ids'
import type { Feeling } from './feelings'
import type { Member, Room } from './house'
import type { Item, Task } from './items'
import type { Routine } from './routines'
import { choreBoard, daysAgo, daysSinceDone, needList, taskList } from './lists'
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
  const today = '2026-09-29' as LocalDate
  const wren = 'wren' as UserId
  const member = (userId: UserId, day: number): Member => ({
    houseId: 'h' as Member['houseId'],
    userId,
    role: 'member',
    joinedAt: instant(day),
    status: { active: true },
  })
  const members = [member(me, 1), member(wren, 2)]
  const room = (name: string, sortOrder: number, routineId?: string): Room => ({
    id: name as Room['id'],
    houseId: 'h' as Room['houseId'],
    name,
    floor: 'first',
    kind: 'common',
    sortOrder,
    ...(routineId && { routineId: routineId as Room['routineId'] & string }),
  })
  const routine = (id: string, sortOrder: number, startsWith: UserId): Routine => ({
    id: id as Routine['id'],
    houseId: 'h' as Routine['houseId'],
    name: id,
    icon: 'broom',
    resets: 'weekly',
    startsOn: today,
    startsWith,
    sortOrder,
    createdAt: instant(0),
  })
  const chore = (title: string, o: Partial<Chore> = {}): Chore =>
    ({ ...t(title), category: 'chore', kind: 'deep_clean', rooms: [], ...o }) as Chore
  const rooms = [
    room('Kitchen', 2, 'r1'),
    room('Dining', 1, 'r1'),
    room('Garden', 3),
    room('Bath', 4, 'r2'),
  ]
  const routines = [routine('r2', 0, wren), routine('r1', 1, me)]
  const board = (items: Item[], feelings: Feeling[] = []) =>
    choreBoard(items, { rooms, routines, members, feelings, me, today, tz: NY })

  it('puts your card first, with its chores under their first room in house order', () => {
    const vacuum = chore('Vacuum', { rooms: ['Kitchen', 'Dining'] as never })
    const sink = chore('Sink', { rooms: ['Kitchen'] as never, lastDone: { at: now, by: wren } })
    const b = board([vacuum, sink])
    expect(b.cards.map((c) => [c.routine.id, c.holder, c.next, c.mine])).toEqual([
      ['r1', me, wren, true],
      ['r2', wren, me, false],
    ])
    expect(b.cards[0]!.rooms.map((r) => [r.room.name, r.chores.map((c) => c.chore.title)])).toEqual(
      [
        ['Dining', ['Vacuum']],
        ['Kitchen', ['Sink']],
      ],
    )
    expect(b.cards[0]!.chores.map((c) => [c.chore.title, c.done])).toEqual([
      ['Sink', true],
      ['Vacuum', false],
    ])
  })

  it('upkeep and chores nobody is on go to one list, felt first, and quiet after they are done', () => {
    const dishes = chore('Dishes', { kind: 'upkeep', rooms: ['Kitchen'] as never })
    const trash = chore('Trash', { kind: 'upkeep' })
    const weeds = chore('Weeds', { rooms: ['Garden'] as never })
    const gone = chore('Gone', { archivedAt: now })
    const f: Feeling = { itemId: dishes.id, by: wren, kind: 'frustrated', at: now }
    const b = board([trash, weeds, dishes, gone], [f])
    expect(b.upkeep.felt.map((c) => c.chore.title)).toEqual(['Dishes'])
    expect(b.upkeep.calm.map((c) => c.title)).toEqual(['Trash', 'Weeds'])
    const after = board([{ ...dishes, lastDone: { at: plusMs(now, 1), by: me } }], [f])
    expect(after.upkeep.felt).toEqual([])
    expect(after.upkeep.calm.map((c) => c.title)).toEqual(['Dishes'])
  })

  it("a card carries its chores' active feelings", () => {
    const sink = chore('Sink', { rooms: ['Bath'] as never })
    const f: Feeling = { itemId: sink.id, by: me, kind: 'anxious', at: now }
    expect(board([sink], [f]).cards.find((c) => c.routine.id === 'r2')!.feelings).toEqual([f])
  })

  it('says how long ago plainly', () => {
    expect(
      daysSinceDone(
        chore('x', { lastDone: { at: plusMs(now, -9 * MS_PER_DAY), by: me } }),
        now,
        NY,
      ),
    ).toBe(9)
    expect([0, 1, 9].map(daysAgo)).toEqual(['today', 'yesterday', '9 days ago'])
  })
})
