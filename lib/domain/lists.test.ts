import { describe, expect, it } from 'vitest'
import { asId, type ContactId, type HouseId, type ItemId, type UserId } from './ids'
import { DEFAULT_FEELING_WEIGHTS, type Feeling } from './feelings'
import type { Member, Room } from './house'
import type { Item, Task } from './items'
import type { Routine } from './routines'
import {
  choreBoard,
  choreNames,
  daysAgo,
  daysSinceDone,
  choresLine,
  doneLine,
  hasItLine,
  holdingLine,
  needList,
  STARTER_CHORES,
  urgentTabs,
  type Ranked,
  type Ranking,
  taskList,
  whoseLine,
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

// A fixed clock (T108): Tuesday 2026-09-29, noon in New York.
const NY = 'America/New_York'
const NOW = instantAt('2026-09-29' as LocalDate, '12:00' as LocalTime, NY)
const ranking = (feelings: Feeling[] = []): Ranking => ({
  feelings,
  weights: DEFAULT_FEELING_WEIGHTS,
  now: NOW,
  tz: NY,
})
const titles = (r: readonly Ranked<Item>[]) => r.map((x) => x.item.title)
const feel = (item: Item, kind: Feeling['kind'], by = you): Feeling => ({
  itemId: item.id,
  by,
  kind,
  at: NOW,
})

describe('taskList (ranked, T108)', () => {
  it('lists every open task by score; equal scores by date, then newest', () => {
    // Wed, Thu and Thu 10:00 are all due within 3 days (25 + 15); the undated ones are 25.
    expect(titles(taskList(items, 'all', me, ranking()))).toEqual([
      'Wed',
      'Thu 10:00',
      'Thu any time',
      'Undated new',
      'Undated old',
    ])
  })

  it('a feeling moves a task up its own tab, with its tier', () => {
    const old = items[0]!
    const ranked = taskList(items, 'all', me, ranking([feel(old, 'anxious')]))
    expect(titles(ranked)[0]).toBe('Undated old')
    expect(ranked[0]!.score).toMatchObject({ score: 45, tier: 'soon' })
    expect(ranked.at(-1)!.score.tier).toBe('normal')
  })

  it('Urgent priority goes to the top', () => {
    const urgent = t('Leak', { priority: 'urgent' })
    expect(titles(taskList([...items, urgent], 'all', me, ranking()))[0]).toBe('Leak')
  })

  it('filters to mine and to outside help', () => {
    expect(titles(taskList(items, 'mine', me, ranking()))).toEqual(['Wed', 'Undated new'])
    expect(titles(taskList(items, 'outside', me, ranking()))).toEqual(['Thu 10:00'])
  })
})

describe('needList (ranked, T108)', () => {
  const n = (title: string, o: Partial<Task> = {}, created = 0) =>
    ({ ...t(title, o, created), category: 'need' }) as Item
  const anxious = n('Anxious about', {}, 0)
  const needs: Item[] = [
    n('Old', {}, 1),
    n('New', {}, 3),
    n('By Friday', { when: { date: '2026-10-02' as LocalDate } }),
    n('By Wednesday', { when: { date: '2026-09-30' as LocalDate } }),
    n('Got it', { done: { at: instant(5), by: me } } as never),
    anxious,
  ]

  it('ranks by score: a feeling moves a need up; then needed-by, then newest', () => {
    expect(titles(needList(needs, ranking([feel(anxious, 'anxious')])))).toEqual([
      'Anxious about',
      'By Wednesday',
      'By Friday',
      'New',
      'Old',
    ])
    expect(titles(needList(needs, ranking()))).toEqual([
      'By Wednesday',
      'By Friday',
      'New',
      'Old',
      'Anxious about',
    ])
  })

  it('a 😌 lowers a need but never hides it', () => {
    const r = needList(needs, ranking([feel(anxious, 'meh')]))
    expect(titles(r).at(-1)).toBe('Anxious about')
    expect(r).toHaveLength(5)
  })
})

describe('urgentTabs (T108)', () => {
  const r = { ...ranking(), rooms: [] as Room[], routines: [] as Routine[] }
  it('has a kind when something open of it is Urgent', () => {
    expect(urgentTabs(items, r)).toEqual(new Set())
    const leak = t('Leak', { priority: 'urgent' })
    const milk = { ...t('Milk', { priority: 'high' }), category: 'need' } as Item
    const both = [...items, leak, milk]
    expect(urgentTabs(both, r)).toEqual(new Set(['task']))
    // High (45) + 😰 (20) + 😤 (15) = 80: Urgent.
    const felt = ranking([feel(milk, 'anxious'), feel(milk, 'frustrated', me)])
    expect(urgentTabs(both, { ...r, ...felt })).toEqual(new Set(['task', 'need']))
  })

  it('leaves out done and deleted items, and chores someone is on', () => {
    const done = t('Done', { priority: 'urgent', done: { at: instant(5), by: me } })
    const gone = t('Gone', { priority: 'urgent', archivedAt: instant(5) })
    const upkeep = {
      ...t('Trash', { priority: 'urgent' }),
      category: 'chore',
      kind: 'upkeep',
      rooms: [],
    } as Item
    expect(urgentTabs([done, gone], r)).toEqual(new Set())
    expect(urgentTabs([upkeep], r)).toEqual(new Set(['chore']))
    const kitchen = { id: 'k', sortOrder: 0, name: 'Kitchen', routineId: 'r1' } as unknown as Room
    const routine = { id: 'r1' } as unknown as Routine
    const deep = { ...upkeep, kind: 'deep_clean', rooms: ['k'] } as unknown as Item
    expect(urgentTabs([deep], { ...r, rooms: [kitchen], routines: [routine] })).toEqual(new Set())
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
    choreBoard(items, { ...ranking(feelings), rooms, routines, members, me, today })

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

  it('ranks Upkeep by score (T108): rows highest first with Urgent or Soon, then chips', () => {
    const dishes = chore('Dishes', { kind: 'upkeep' })
    const trash = chore('Trash', { kind: 'upkeep' })
    const leak = chore('Leak', { kind: 'upkeep', priority: 'urgent' })
    const plants = chore('Plants', { kind: 'upkeep', priority: 'low' })
    const mop = chore('Mop', { kind: 'upkeep', priority: 'high' })
    const fs: Feeling[] = [
      { itemId: dishes.id, by: wren, kind: 'anxious', at: now },
      { itemId: trash.id, by: wren, kind: 'confused', at: now },
    ]
    const b = board([trash, dishes, leak, plants, mop, chore('Air', { kind: 'upkeep' })], fs)
    expect(b.upkeep.felt.map((c) => [c.chore.title, c.tier])).toEqual([
      ['Leak', 'urgent'],
      ['Dishes', 'soon'],
      ['Mop', 'soon'],
      ['Trash', undefined],
    ])
    expect(b.upkeep.calm.map((c) => c.title)).toEqual(['Air', 'Plants'])
  })

  it("a card and each of its rooms carry their chores' active feelings", () => {
    const sink = chore('Sink', { rooms: ['Bath'] as never })
    const f: Feeling = { itemId: sink.id, by: me, kind: 'anxious', at: now }
    const card = board([sink], [f]).cards.find((c) => c.routine.id === 'r2')!
    expect(card.feelings).toEqual([f])
    expect(card.rooms.map((r) => [r.room.name, r.feelings])).toEqual([['Bath', [f]]])
  })

  describe('holdingLine', () => {
    const wednesday = '2026-11-04' as LocalDate
    const card = (o: Partial<Routine>, roomNames: string[] = []) =>
      ({
        routine: { ...routine('r', 0, me), ...o },
        mine: true,
        rooms: roomNames.map((n) => ({ room: room(n, 0), chores: [], feelings: [] })),
        chores: [],
        feelings: [],
      }) satisfies Parameters<typeof holdingLine>[0][number]

    it('says what you have and through when', () => {
      expect(holdingLine([card({}, ['Kitchen', 'Dining'])], wednesday)).toBe(
        'This week you have the kitchen and dining · through Sunday',
      )
      expect(holdingLine([card({ resets: 'monthly' }, ['Garden'])], wednesday)).toBe(
        'This month you have the garden · through Nov 30',
      )
    })
    it('says nothing when you hold nothing, and uses the name when it has no rooms', () => {
      expect(holdingLine([{ ...card({}), mine: false }], wednesday)).toBeUndefined()
      expect(holdingLine([card({ name: 'Bins' })], wednesday)).toContain('you have the bins')
    })
    it('has no one date for cards on different schedules', () => {
      expect(
        holdingLine([card({}, ['Kitchen']), card({ resets: 'monthly' }, ['Garden'])], wednesday),
      ).toBe('You have the kitchen and garden for now')
    })
  })

  it('doneLine names what is done, without counting', () => {
    const line = (titles: string[], done: string[]) =>
      doneLine(titles.map((t2) => ({ chore: chore(t2), done: done.includes(t2) })))
    expect(line(['Sink', 'Stove', 'Floor'], [])).toBeUndefined()
    expect(line(['Sink', 'Stove', 'Floor'], ['Sink', 'Stove'])).toBe('Sink and stove done')
    expect(line(['Sink'], ['Sink'])).toBe('All done')
  })

  it('says whose rooms are and who has a room in words (T105)', () => {
    const turns = routine('r', 0, me)
    const always = { ...turns, fixedMember: wren }
    const monthly = { ...turns, resets: 'monthly' as const }
    expect(whoseLine(turns)).toBe('Yours this week')
    expect(whoseLine(monthly, 'Alex')).toBe("Alex's this month")
    expect(whoseLine(always, 'Alex')).toBe("Alex's")
    expect(hasItLine(turns, 'Alex', 'you')).toBe('Alex has it this week, then you')
    expect(hasItLine(turns)).toBe('You have it this week')
    expect(hasItLine(always, 'Alex', 'you')).toBe('Alex looks after it')
    expect(hasItLine(always)).toBe('You look after it')
  })

  it("choresLine says a housemate's room in words (T105)", () => {
    const line = (titles: string[]) =>
      choresLine(titles.map((t2) => ({ chore: chore(t2), done: false })))
    expect(line(['Clean mirror', 'Mop floor', 'Scrub toilet', 'Trash'])).toBe(
      'Clean mirror, mop floor, scrub toilet and trash',
    )
    expect(line(['Weeds'])).toBe('Weeds')
    expect(line([])).toBe('')
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

describe('choreNames (T101)', () => {
  const c = (title: string, o: Partial<Chore> = {}): Chore =>
    ({ ...t(title), category: 'chore', kind: 'deep_clean', rooms: [], ...o }) as Chore
  const r = (id: string) => asId<'room'>(id) as never

  it('offers each house name once, most-used first, with its usual icon, then the starters', () => {
    const names = choreNames([
      c('Swiffer', { rooms: [r('a')], icon: 'mop' }),
      c('swiffer ', { rooms: [r('b')], icon: 'mop' }),
      c('Swiffer', { rooms: [r('c')], icon: 'broom' }),
      c('Polish silver', { rooms: [r('a')] }),
      c('Gone', { archivedAt: instant(5) }),
      t('A task named Vacuum') as Item,
    ])
    expect(names.slice(0, 2)).toEqual([
      { title: 'Swiffer', icon: 'mop' },
      { title: 'Polish silver' },
    ])
    // Swiffer is the house's own now, so the starter's copy isn't offered twice.
    const titles = names.map((n) => n.title.toLowerCase())
    expect(titles.filter((n) => n === 'swiffer')).toHaveLength(1)
    expect(titles).toContain('vacuum')
    expect(titles).not.toContain('gone')
    expect(names).toHaveLength(2 + STARTER_CHORES.length - 1)
  })

  it('offers just the starters in a house with no chores', () => {
    expect(choreNames([])).toEqual(STARTER_CHORES)
  })
})
