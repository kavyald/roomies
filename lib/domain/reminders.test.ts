import { describe, expect, it } from 'vitest'
import {
  asId,
  type ContactId,
  type HouseId,
  type ItemId,
  type OptionId,
  type PollId,
  type RunId,
  type UserId,
} from './ids'
import type { Chore, Item, Task } from './items'
import type { Recipient } from './notifications'
import type { Poll } from './polls'
import type { Member, Room } from './house'
import { remindersFor, type ReminderInput } from './reminders'
import type { Routine } from './routines'
import type { Run } from './runs'
import { instantAt, type LocalDate, type LocalTime } from './time'

const NY = 'America/New_York'
const at = (date: string, time = '09:00') => instantAt(date as LocalDate, time as LocalTime, NY)
const NOW = at('2026-09-29', '09:00') // Tue
const user = (u: string) => asId<'user'>(u) as UserId
const [kavya, wren, sam] = [user('kavya'), user('wren'), user('sam')] as const
const house = asId<'house'>('h') as HouseId
const person = (userId: UserId): Recipient => ({ userId, name: userId, off: new Set() })

const base = (title: string) => ({
  id: asId<'item'>(title) as ItemId,
  houseId: house,
  title,
  priority: 'normal' as const,
  createdBy: kavya,
  createdAt: at('2026-09-01'),
})
const task = (title: string, o: Partial<Task>): Task => ({ ...base(title), category: 'task', ...o })
const chore = (title: string, o: Partial<Chore>): Chore => ({
  ...base(title),
  category: 'chore',
  kind: 'deep_clean',
  rooms: [],
  ...o,
})

const input = (o: Partial<ReminderInput> = {}): ReminderInput => ({
  houseId: 'h',
  tz: NY,
  now: NOW,
  items: [],
  polls: [],
  runs: [],
  people: [person(kavya), person(wren), person(sam)],
  runLabel: (r) => r.title ?? 'A run',
  routines: [],
  rooms: [],
  members: [],
  ...o,
})
const titles = (i: ReminderInput) => remindersFor(i).map((d) => [d.userId, d.title, d.body])

describe('reminders for tasks', () => {
  it('the assignee hears the day before and the day of, and nothing for other days', () => {
    const items: Item[] = [
      task('Call the plumber', { assignee: wren, when: { date: '2026-09-30' as LocalDate } }),
      task('Pay the internet', { assignee: sam, when: { date: '2026-09-29' as LocalDate } }),
      task('Paint the hall', { assignee: sam, when: { date: '2026-10-05' as LocalDate } }),
      task('Yesterday', { assignee: sam, when: { date: '2026-09-28' as LocalDate } }),
      task('Nobody', { when: { date: '2026-09-29' as LocalDate } }),
      task('Done', {
        assignee: sam,
        when: { date: '2026-09-29' as LocalDate },
        done: { at: NOW, by: sam },
      }),
      task('Archived', {
        assignee: sam,
        when: { date: '2026-09-29' as LocalDate },
        archivedAt: NOW,
      }),
      chore('A chore has no due date', { lastDone: { at: at('2026-09-22'), by: kavya } }),
    ]
    expect(titles(input({ items }))).toEqual([
      [wren, 'Tomorrow: Call the plumber', "Just a heads-up: it's on you tomorrow."],
      [sam, 'Today: Pay the internet', "It's on you today."],
    ])
    for (const d of remindersFor(input({ items }))) {
      expect(`${d.title} ${d.body}`).not.toMatch(/overdue|failed|missed/i)
      expect(d.category).toBe('due')
    }
  })
})

describe('routine handovers', () => {
  // 2026-09-28 is a Monday.
  const MONDAY = at('2026-09-28', '09:00')
  const member = (userId: UserId, day: number): Member => ({
    houseId: house,
    userId,
    role: 'member',
    joinedAt: at(`2026-09-0${day}`),
    status: { active: true },
  })
  const members = [member(kavya, 1), member(wren, 2), member(sam, 3)]
  const routine = (id: string, o: Partial<Routine> = {}): Routine => ({
    id: id as Routine['id'],
    houseId: house,
    name: id,
    icon: 'broom',
    resets: 'weekly',
    startsOn: '2026-09-21' as LocalDate,
    startsWith: kavya,
    sortOrder: 0,
    createdAt: at('2026-09-01'),
    ...o,
  })
  const room = (name: string, routineId: string, sortOrder = 0): Room => ({
    id: name as Room['id'],
    houseId: house,
    name,
    floor: 'first',
    kind: 'common',
    sortOrder,
    routineId: routineId as Room['id'] & never,
  })
  const handovers = (o: Partial<ReminderInput>) =>
    remindersFor(input({ now: MONDAY, members, ...o })).filter((d) =>
      d.dedupeKey?.startsWith('handover:'),
    )

  it('tells the new holder once, naming all their rooms, with a key that stops a second send', () => {
    const [d, ...rest] = handovers({
      routines: [routine('r1')],
      rooms: [room('Kitchen', 'r1', 1), room('Dining', 'r1', 2)],
    })
    expect(rest).toEqual([])
    expect(d).toMatchObject({
      userId: wren, // Kavya last week, Wren this week
      category: 'assigned',
      title: 'You have the kitchen and dining this week',
      url: '/h/h/chores',
    })
    expect(d!.dedupeKey).toBe(`handover:h:2026-09-28:${wren}`)
    const again = handovers({
      routines: [routine('r1')],
      rooms: [room('Kitchen', 'r1', 1), room('Dining', 'r1', 2)],
      now: at('2026-09-28', '18:00'),
    })
    expect(again[0]!.dedupeKey).toBe(d!.dedupeKey)
  })

  it('combines every routine one person takes over into one message', () => {
    const list = handovers({
      routines: [routine('r1'), routine('r2')],
      rooms: [room('Kitchen', 'r1'), room('Bath', 'r2')],
    })
    expect(list.map((d) => [d.userId, d.title])).toEqual([
      [wren, 'You have the kitchen and bath this week'],
    ])
    expect(
      handovers({
        routines: [
          routine('r1'),
          routine('r2', { resets: 'biweekly', startsOn: '2026-09-14' as LocalDate }),
        ],
        rooms: [room('Kitchen', 'r1'), room('Bath', 'r2')],
      }).find((d) => d.userId === wren)!.title,
    ).toBe('You have the kitchen and bath for now')
  })

  it('names the routine when it has no rooms, and uses the words for its period', () => {
    const [d] = handovers({
      now: at('2026-10-01', '09:00'),
      routines: [routine('Garden', { resets: 'monthly', startsOn: '2026-09-01' as LocalDate })],
    })
    expect(d!.title).toBe('You have the garden this month')
  })

  it('says nothing midweek, for a fixed person, a removed routine, or a house of one', () => {
    const r = [routine('r1')]
    expect(handovers({ routines: r, now: at('2026-09-29', '09:00') })).toEqual([])
    expect(handovers({ routines: [routine('r1', { fixedMember: sam })] })).toEqual([])
    expect(handovers({ routines: [routine('r1', { removedAt: NOW })] })).toEqual([])
    expect(handovers({ routines: r, members: [members[0]!] })).toEqual([])
  })
})

describe('reminders for polls and runs', () => {
  const poll = (closes: string, votedBy: UserId[] = []): Poll => ({
    id: asId<'poll'>(`p-${closes}`) as PollId,
    houseId: house,
    question: 'Which vacuum?',
    options: [{ id: 'o' as OptionId, label: 'Dyson', addedBy: kavya, addedAt: NOW }],
    votes: votedBy.map((u) => ({ user: u, option: 'o' as OptionId, at: NOW })),
    closesAt: at(closes, '23:59'),
    createdBy: kavya,
    createdAt: NOW,
    state: { open: true },
  })

  it('a poll closing tomorrow reminds whoever has not voted', () => {
    expect(titles(input({ polls: [poll('2026-09-30', [kavya]), poll('2026-10-01')] }))).toEqual([
      [wren, 'Closing tomorrow: Which vacuum?', "Your vote isn't in yet."],
      [sam, 'Closing tomorrow: Which vacuum?', "Your vote isn't in yet."],
    ])
    expect(remindersFor(input({ polls: [poll('2026-09-30')] }))[0]!.url).toBe('/h/h/p/p-2026-09-30')
    const closed = { ...poll('2026-09-30'), state: { open: false as const, closedAt: NOW } }
    expect(remindersFor(input({ polls: [closed] }))).toEqual([])
  })

  it('a poll reopened or given a new deadline is reminded about again (T55)', () => {
    const first = remindersFor(input({ polls: [poll('2026-09-30')] }))
    // Same poll, deadline moved: the reminder the day before the new date has a fresh key.
    const moved = remindersFor(
      input({
        now: at('2026-10-02', '09:00'),
        polls: [{ ...poll('2026-09-30'), closesAt: at('2026-10-03', '23:59') }],
      }),
    )
    expect(moved).toHaveLength(first.length)
    expect(moved[0]!.dedupeKey).not.toBe(first[0]!.dedupeKey)
  })

  it('a batch or visit dated tomorrow reminds everyone', () => {
    const runs: Run[] = [
      {
        id: asId<'run'>('g') as RunId,
        houseId: house,
        kind: 'batch',
        title: 'Groceries',
        runner: kavya,
        createdBy: kavya,
        createdAt: NOW,
        when: { date: '2026-09-30' as LocalDate },
        state: { open: true },
      },
      {
        id: asId<'run'>('v') as RunId,
        houseId: house,
        kind: 'visit',
        title: 'Super visit',
        contactId: asId<'contact'>('super') as ContactId,
        runner: kavya,
        createdBy: kavya,
        createdAt: NOW,
        when: { date: '2026-09-30' as LocalDate, time: '10:00' as LocalTime },
        state: { open: true },
      },
      {
        id: asId<'run'>('later') as RunId,
        houseId: house,
        kind: 'batch',
        runner: kavya,
        createdBy: kavya,
        createdAt: NOW,
        when: { date: '2026-10-02' as LocalDate },
        state: { open: true },
      },
    ]
    const r = titles(input({ runs, people: [person(kavya)] }))
    expect(r).toEqual([
      [kavya, 'Tomorrow: Groceries', 'Add anything before it goes?'],
      [kavya, 'Tomorrow: Super visit', 'Super visit is tomorrow at 10:00.'],
    ])
    expect(remindersFor(input({ runs, people: [person(kavya)] })).map((d) => d.url)).toEqual([
      '/h/h/r/g',
      '/h/h/r/v',
    ])
  })
})

describe('dedupe keys', () => {
  it('are stable across runs on the same day, and differ for day-before and day-of', () => {
    const t = task('Call', { assignee: wren, when: { date: '2026-09-30' as LocalDate } })
    const first = remindersFor(input({ items: [t] }))
    const again = remindersFor(input({ items: [t], now: at('2026-09-29', '21:00') }))
    expect(again.map((d) => d.dedupeKey)).toEqual(first.map((d) => d.dedupeKey))
    const dayOf = remindersFor(input({ items: [t], now: at('2026-09-30') }))
    expect(dayOf[0]!.dedupeKey).not.toBe(first[0]!.dedupeKey)
  })
})
