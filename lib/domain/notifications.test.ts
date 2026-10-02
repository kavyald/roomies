import { describe, expect, it } from 'vitest'
import type { DomainEvent } from './events'
import type { Feeling } from './feelings'
import {
  asId,
  type ActionId,
  type HouseId,
  type ItemId,
  type PollId,
  type RunId,
  type UserId,
} from './ids'
import {
  DEFAULT_QUIET_HOURS,
  isQuiet,
  notificationsFor,
  sendAfter,
  type NotificationContext,
  type QuietHours,
  type Recipient,
} from './notifications'
import { instantAt, type LocalDate, type LocalTime } from './time'

const NY = 'America/New_York'
const at = (date: string, time: string, tz = NY) =>
  instantAt(date as LocalDate, time as LocalTime, tz)
const q = (start: string, end: string): QuietHours => ({
  start: start as LocalTime,
  end: end as LocalTime,
})

describe('quiet hours', () => {
  it.each<[string, string, QuietHours, boolean]>([
    ['21:59', 'just before 10pm', DEFAULT_QUIET_HOURS, false],
    ['22:00', 'at 10pm', DEFAULT_QUIET_HOURS, true],
    ['03:00', 'in the night', DEFAULT_QUIET_HOURS, true],
    ['07:59', 'just before 8am', DEFAULT_QUIET_HOURS, true],
    ['08:00', 'at 8am', DEFAULT_QUIET_HOURS, false],
    ['13:00', 'midday', DEFAULT_QUIET_HOURS, false],
    ['13:00', 'a daytime window', q('12:00', '14:00'), true],
    ['14:00', 'the end of a daytime window', q('12:00', '14:00'), false],
    ['03:00', 'an empty window (off)', q('09:00', '09:00'), false],
  ])('%s (%s) → quiet: %s', (time, _, quiet, expected) => {
    expect(isQuiet(at('2026-09-29', time), NY, quiet)).toBe(expected)
  })

  it('holds a message until the quiet hours end, the same night or the next morning', () => {
    expect(sendAfter(at('2026-09-29', '23:30'), NY, DEFAULT_QUIET_HOURS)).toEqual(
      at('2026-09-30', '08:00'),
    )
    expect(sendAfter(at('2026-09-30', '06:15'), NY, DEFAULT_QUIET_HOURS)).toEqual(
      at('2026-09-30', '08:00'),
    )
    const noon = at('2026-09-30', '12:00')
    expect(sendAfter(noon, NY, DEFAULT_QUIET_HOURS)).toEqual(noon)
  })

  it('uses the person’s own time zone, and the right 8am across the fall-back night', () => {
    // 11pm in New York is 8pm in Los Angeles: not quiet there.
    expect(isQuiet(at('2026-09-29', '23:00'), 'America/Los_Angeles', DEFAULT_QUIET_HOURS)).toBe(
      false,
    )
    expect(sendAfter(at('2026-10-31', '23:00'), NY, DEFAULT_QUIET_HOURS)).toEqual(
      at('2026-11-01', '08:00'),
    )
  })
})

const house = asId<'house'>('h') as HouseId
const [kavya, wren, sam] = (['kavya', 'wren', 'sam'] as const).map(
  (u) => asId<'user'>(u) as UserId,
) as [UserId, UserId, UserId]
const leak = asId<'item'>('leak') as ItemId
const act = asId<'action'>('a') as ActionId
const noon = at('2026-09-29', '12:00')
const person = (userId: UserId, name: string, o: Partial<Recipient> = {}): Recipient => ({
  userId,
  name,
  off: new Set(),
  ...o,
})
const ctx = (o: Partial<NotificationContext> = {}): NotificationContext => ({
  houseId: house,
  houseTz: NY,
  now: noon,
  people: [person(kavya, 'Kavya'), person(wren, 'Wren'), person(sam, 'Sam')],
  items: new Map([[leak, { title: 'Leak under the sink', assignee: wren }]]),
  polls: new Map([['p', { question: 'Which vacuum?', result: 'Dyson V8 wins (3–1)' }]]),
  runs: new Map([
    ['g', { label: "Kavya's run", kind: 'batch' }],
    ['v', { label: 'Super visit', kind: 'visit', date: 'Thu' }],
  ]),
  ...o,
})
const feeling = (kind: Feeling['kind'], by: UserId, note?: string): DomainEvent => ({
  kind: 'feeling.set',
  itemId: leak,
  changes: { previous: null, next: { itemId: leak, by, kind, at: noon, ...(note && { note }) } },
  actionId: act,
  by,
})
const who = (msgs: ReturnType<typeof notificationsFor>) => msgs.map((m) => m.userId)

describe('notificationsFor', () => {
  it('a 😰 feeling tells the assignee, with the note', () => {
    const [m, ...rest] = notificationsFor([feeling('anxious', kavya, 'Water on the floor')], ctx())
    expect(rest).toEqual([])
    expect(m).toEqual({
      userId: wren,
      houseId: house,
      category: 'feelings',
      title: '😰 Kavya feels anxious about Leak under the sink',
      body: 'Water on the floor',
      url: '/h/h/i/leak',
      sendAfter: noon,
    })
    expect(notificationsFor([feeling('frustrated', sam)], ctx())[0]).toMatchObject({
      title: '😤 Sam feels frustrated about Leak under the sink',
      body: "It's on you, so they wanted you to know.",
    })
  })

  it("other feelings, your own feeling, and unassigned items don't notify", () => {
    expect(notificationsFor([feeling('thanks', kavya)], ctx())).toEqual([])
    expect(notificationsFor([feeling('anxious', wren)], ctx())).toEqual([])
    const unassigned = ctx({ items: new Map([[leak, { title: 'Leak' }]]) })
    expect(notificationsFor([feeling('anxious', kavya)], unassigned)).toEqual([])
    const removed: DomainEvent = {
      kind: 'feeling.removed',
      itemId: leak,
      changes: { previous: { itemId: leak, by: kavya, kind: 'anxious', at: noon } },
      actionId: act,
      by: kavya,
    }
    expect(notificationsFor([removed], ctx())).toEqual([])
  })

  it('an assignment tells the new assignee, unless they took it themselves', () => {
    const assigned = (memberId: UserId | null, by: UserId): DomainEvent => ({
      kind: 'item.assigned',
      itemId: leak,
      memberId,
      changes: {},
      actionId: act,
      by,
    })
    expect(notificationsFor([assigned(wren, kavya)], ctx())).toEqual([
      expect.objectContaining({
        userId: wren,
        category: 'assigned',
        title: 'For you: Leak under the sink',
        body: 'Kavya asked you to take this on.',
      }),
    ])
    expect(notificationsFor([assigned(wren, wren)], ctx())).toEqual([])
    expect(notificationsFor([assigned(null, kavya)], ctx())).toEqual([])
  })

  it('polls, runs, and people tell everyone else', () => {
    const polls = notificationsFor(
      [
        { kind: 'poll.created', pollId: 'p' as PollId, actionId: act, by: kavya },
        {
          kind: 'poll.closed',
          pollId: 'p' as PollId,
          payload: { result: 'winner' },
          actionId: act,
          by: null,
        },
      ],
      ctx(),
    )
    expect(polls.map((m) => [m.userId, m.title, m.body])).toEqual([
      [wren, 'New poll: Which vacuum?', 'Kavya wants to know. Tap to vote.'],
      [sam, 'New poll: Which vacuum?', 'Kavya wants to know. Tap to vote.'],
      [kavya, 'Poll closed: Which vacuum?', 'Dyson V8 wins (3–1)'],
      [wren, 'Poll closed: Which vacuum?', 'Dyson V8 wins (3–1)'],
      [sam, 'Poll closed: Which vacuum?', 'Dyson V8 wins (3–1)'],
    ])
    const runs = notificationsFor(
      [
        { kind: 'run.created', runId: 'g' as RunId, actionId: act, by: kavya },
        { kind: 'run.created', runId: 'v' as RunId, actionId: act, by: kavya },
        { kind: 'run.date_set', runId: 'v' as RunId, changes: {}, actionId: act, by: sam },
      ],
      ctx(),
    )
    expect(runs.map((m) => [m.userId, m.title])).toEqual([
      [wren, "Kavya is starting Kavya's run"],
      [sam, "Kavya is starting Kavya's run"],
      [kavya, 'Super visit is set for Thu'],
      [wren, 'Super visit is set for Thu'],
    ])
    const people = notificationsFor(
      [
        { kind: 'member.joined', memberId: sam, actionId: act, by: sam },
        { kind: 'member.moved_out', memberId: wren, actionId: act, by: wren },
        {
          kind: 'member.role_changed',
          memberId: wren,
          changes: { role: ['member', 'admin'] },
          actionId: act,
          by: kavya,
        },
      ],
      ctx(),
    )
    expect(people.map((m) => [m.userId, m.title])).toEqual([
      [kavya, 'Sam joined the house 🏠'],
      [wren, 'Sam joined the house 🏠'],
      [kavya, 'Wren moved out'],
      [sam, 'Wren moved out'],
      [wren, "You're now an admin"],
    ])
  })

  it.each([
    ['item.assigned', '/h/h/i/leak', { kind: 'item.assigned', itemId: leak, memberId: wren }],
    ['poll.created', '/h/h/p/p', { kind: 'poll.created', pollId: 'p' }],
    ['poll.closed', '/h/h/p/p', { kind: 'poll.closed', pollId: 'p', payload: {} }],
    ['run.created', '/h/h/r/g', { kind: 'run.created', runId: 'g' }],
    ['run.date_set', '/h/h/r/v', { kind: 'run.date_set', runId: 'v', changes: {} }],
    ['member.joined', '/h/h/house', { kind: 'member.joined', memberId: sam }],
  ])('a %s message opens %s', (_, url, event) => {
    const msgs = notificationsFor([{ ...event, actionId: act, by: kavya } as DomainEvent], ctx())
    expect(msgs.length).toBeGreaterThan(0)
    expect(new Set(msgs.map((m) => m.url))).toEqual(new Set([url]))
  })

  it('skips categories someone turned off, and holds messages through their quiet hours', () => {
    const late = at('2026-09-29', '23:15')
    const c = ctx({
      now: late,
      people: [
        person(kavya, 'Kavya'),
        person(wren, 'Wren', { off: new Set(['polls']) }),
        person(sam, 'Sam', { quietHours: q('00:00', '00:00') }), // no quiet hours
      ],
    })
    const msgs = notificationsFor(
      [{ kind: 'poll.created', pollId: 'p' as PollId, actionId: act, by: kavya }],
      c,
    )
    expect(who(msgs)).toEqual([sam])
    expect(msgs[0]!.sendAfter).toEqual(late)
    const held = notificationsFor([feeling('anxious', kavya)], c)
    expect(held[0]!.sendAfter).toEqual(at('2026-09-30', '08:00'))
  })

  it('nobody outside the house hears anything, and quiet events stay quiet', () => {
    const c = ctx({ people: [person(kavya, 'Kavya')] })
    expect(notificationsFor([feeling('anxious', kavya)], c)).toEqual([]) // Wren isn't a member
    expect(
      notificationsFor([{ kind: 'item.created', itemId: leak, actionId: act, by: kavya }], ctx()),
    ).toEqual([])
    expect(
      notificationsFor(
        [{ kind: 'run.date_set', runId: 'g' as RunId, changes: {}, actionId: act, by: kavya }],
        ctx(),
      ),
    ).toEqual([]) // no date to announce
  })
})
