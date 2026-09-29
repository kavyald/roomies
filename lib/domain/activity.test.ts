import { describe, expect, it } from 'vitest'
import {
  activityFeed,
  activityLine,
  groupByAction,
  pageAtActionBoundary,
  type ActivityNames,
} from './activity'
import type { EventKind, StoredActivityRow } from './events'
import { asId, type ActionId, type HouseId, type UserId } from './ids'
import { instant } from './time'

const KAVYA = asId<'user'>('u-kavya') as UserId
const MAYA = asId<'user'>('u-maya') as UserId
const house = asId<'house'>('h1') as HouseId

let nextId = 0
const row = (kind: EventKind, extra: Partial<StoredActivityRow> = {}): StoredActivityRow => ({
  id: ++nextId,
  houseId: house,
  at: instant(nextId * 1000),
  actorId: KAVYA,
  actionId: asId<'action'>(`a${nextId}`) as ActionId,
  kind,
  payload: { v: 1 },
  ...extra,
})

const names: ActivityNames = {
  person: (id) => ({ 'u-kavya': 'Kavya', 'u-maya': 'Maya' })[id as string],
  item: (id) =>
    ({
      i1: { title: 'Leak under the sink', category: 'task' as const },
      i2: { title: 'Radiator clanking', category: 'task' as const },
      i3: { title: 'Window latch', category: 'task' as const },
      n1: { title: 'Tomatoes', category: 'need' as const },
      c1: { title: 'Trash', category: 'chore' as const },
    })[id as string],
  run: (id) =>
    ({ visit: 'Landlord visit', req: 'Landlord request', groc: "Wren's grocery run" })[
      id as string
    ],
  poll: () => 'Which vacuum?',
  option: () => 'Dyson V8',
  cost: () => '$42.50',
  contact: (id) => ({ super: 'Super' })[id as string],
  room: (id) => ({ kitchen: 'Kitchen', fire: 'Fire' })[id as string],
}
const member = { isAdmin: false }
const admin = { isAdmin: true }
const id = <K extends string>(s: string) => asId<K>(s)

describe('activityLine: a bulk action is one line', () => {
  it('phrases a 3-task move to a visit as one line', () => {
    const actionId = id<'action'>('bulk') as ActionId
    const rows = ['i1', 'i2', 'i3'].map((item) =>
      row('run.item_moved', { actionId, itemId: id(item), runId: id('req'), toRunId: id('visit') }),
    )
    const feed = activityFeed(rows.reverse(), names, member)
    expect(feed).toHaveLength(1)
    expect(feed[0]!.text).toBe('Kavya moved 3 tasks to Landlord visit')
    expect(feed[0]!.id).toBe(Math.max(...rows.map((r) => r.id)))
  })

  it('uses "items" when an action mixes categories, and the title for one', () => {
    const actionId = id<'action'>('mixed') as ActionId
    const two = [
      row('run.item_added', { actionId, itemId: id('n1'), runId: id('groc') }),
      row('run.item_added', { actionId, itemId: id('c1'), runId: id('groc') }),
    ]
    expect(activityLine(two, names, member)!.text).toBe("Kavya added 2 items to Wren's grocery run")
    expect(activityLine([two[0]!], names, member)!.text).toBe(
      "Kavya added Tomatoes to Wren's grocery run",
    )
  })
})

describe('activityLine: every kind', () => {
  const cases: [EventKind, Partial<StoredActivityRow>, string][] = [
    ['item.created', { itemId: id('i1') }, 'Kavya added Leak under the sink'],
    ['item.edited', { itemId: id('i1') }, 'Kavya edited Leak under the sink'],
    ['item.done', { itemId: id('i1') }, 'Kavya finished Leak under the sink'],
    ['item.done', { itemId: id('n1') }, 'Kavya got Tomatoes'],
    ['item.reopened', { itemId: id('i1') }, 'Kavya reopened Leak under the sink'],
    ['item.archived', { itemId: id('i1') }, 'Kavya archived Leak under the sink'],
    ['item.restored', { itemId: id('i1') }, 'Kavya brought back Leak under the sink'],
    [
      'item.assigned',
      { itemId: id('i1'), memberId: MAYA },
      'Kavya put Maya on Leak under the sink',
    ],
    ['item.assigned', { itemId: id('i1'), memberId: KAVYA }, 'Kavya took Leak under the sink'],
    ['item.assigned', { itemId: id('i1') }, 'Kavya opened up Leak under the sink for anyone'],
    [
      'item.handled_by_changed',
      { itemId: id('i1'), contactId: id('super') },
      'Kavya handed Leak under the sink to Super',
    ],
    [
      'item.handled_by_changed',
      { itemId: id('i1') },
      'Kavya set Leak under the sink to be handled by one of us',
    ],
    ['chore.done', { itemId: id('c1') }, 'Kavya did Trash'],
    [
      'feeling.set',
      { itemId: id('i2'), actorId: MAYA, changes: { previous: null, next: { kind: 'anxious' } } },
      'Maya’s feeling anxious about Radiator clanking',
    ],
    [
      'feeling.set',
      { itemId: id('i2'), changes: { next: { kind: 'meh' } } },
      'Kavya’s feeling like it’s not a big deal about Radiator clanking',
    ],
    ['poll.created', { pollId: id('p') }, 'Kavya asked “Which vacuum?”'],
    [
      'poll.closed',
      { pollId: id('p'), optionId: id('o'), actorId: null, payload: { v: 1, result: 'winner' } },
      '“Which vacuum?” closed: “Dyson V8” won',
    ],
    [
      'poll.closed',
      { pollId: id('p'), payload: { v: 1, result: 'tie' } },
      '“Which vacuum?” ended in a tie. Talk it out?',
    ],
    [
      'poll.closed',
      { pollId: id('p'), payload: { v: 1, result: 'no_votes' } },
      '“Which vacuum?” closed with no votes',
    ],
    ['poll.reopened', { pollId: id('p') }, 'Kavya reopened “Which vacuum?”'],
    ['poll.deadline_changed', { pollId: id('p') }, 'Kavya changed when “Which vacuum?” closes'],
    [
      'poll.option_added',
      { pollId: id('p'), optionId: id('o') },
      'Kavya added “Dyson V8” to “Which vacuum?”',
    ],
    ['poll.voted', { pollId: id('p'), optionId: id('o') }, 'Kavya voted on “Which vacuum?”'],
    ['poll.vote_changed', { pollId: id('p') }, 'Kavya changed their vote on “Which vacuum?”'],
    ['run.created', { runId: id('groc') }, "Kavya started Wren's grocery run"],
    ['run.renamed', { runId: id('groc') }, "Kavya renamed Wren's grocery run"],
    ['run.date_set', { runId: id('visit') }, 'Kavya set a date for Landlord visit'],
    [
      'run.point_person_changed',
      { runId: id('visit'), memberId: MAYA },
      'Kavya made Maya the point person for Landlord visit',
    ],
    [
      'run.item_returned',
      { runId: id('req'), itemId: id('i1'), note: 'on us' },
      'Kavya put Leak under the sink back in the pool',
    ],
    [
      'run.item_done',
      { runId: id('groc'), itemId: id('n1') },
      "Kavya checked off Tomatoes on Wren's grocery run",
    ],
    [
      'request.sent',
      { runId: id('req'), contactId: id('super') },
      'Kavya sent Landlord request to Super',
    ],
    ['request.closed', { runId: id('req'), actorId: null }, 'Landlord request is all sorted'],
    ['run.finished', { runId: id('groc') }, "Kavya finished Wren's grocery run"],
    [
      'cost.added',
      { costId: id('c'), runId: id('groc') },
      "Kavya added $42.50 for Wren's grocery run",
    ],
    [
      'cost.added',
      { costId: id('c'), itemId: id('i1') },
      'Kavya added $42.50 for Leak under the sink',
    ],
    ['cost.added', { costId: id('c') }, 'Kavya added $42.50'],
    ['cost.edited', { costId: id('c') }, 'Kavya edited a cost'],
    ['cost.removed', { costId: id('c') }, 'Kavya removed a cost'],
    ['house.created', {}, 'Kavya set up the house'],
    ['settings.feeling_weights_changed', {}, 'Kavya changed the feeling weights'],
    ['member.joined', { memberId: MAYA, actorId: MAYA }, 'Maya joined the house'],
    ['member.room_changed', { memberId: MAYA, roomId: id('fire') }, 'Maya moved into Fire'],
    [
      'member.role_changed',
      { memberId: MAYA, changes: { role: ['member', 'admin'] } },
      'Kavya made Maya an admin',
    ],
    [
      'member.role_changed',
      { memberId: MAYA, changes: { role: ['admin', 'member'] } },
      'Kavya made Maya a member',
    ],
    ['member.moved_out', { memberId: MAYA }, 'Maya moved out'],
    ['member.removed', { memberId: MAYA }, 'Kavya removed Maya from the house'],
    ['contact.created', { contactId: id('super') }, 'Kavya added Super to contacts'],
    ['contact.edited', { contactId: id('super') }, 'Kavya updated Super'],
    ['contact.removed', { contactId: id('super') }, 'Kavya removed Super from contacts'],
    ['room.added', { roomId: id('kitchen') }, 'Kavya added Kitchen'],
    [
      'room.renamed',
      { roomId: id('kitchen'), changes: { name: ['Galley', 'Kitchen'] } },
      'Kavya renamed Galley to Kitchen',
    ],
    ['room.renamed', { roomId: id('kitchen') }, 'Kavya renamed Kitchen'],
    ['room.archived', { roomId: id('kitchen') }, 'Kavya archived Kitchen'],
  ]

  it.each(cases)('%s → %s', (kind, extra, expected) => {
    expect(activityLine([row(kind, extra)], names, admin)?.text).toBe(expected)
  })

  it('names Roomies for jobs, "Former roommate" for deleted people, and fallbacks for unknowns', () => {
    expect(activityLine([row('house.created', { actorId: null })], names, member)!.text).toBe(
      'Roomies set up the house',
    )
    expect(activityLine([row('house.created', { actorId: id('gone') })], names, member)!.text).toBe(
      'Former roommate set up the house',
    )
    expect(
      activityLine(
        [row('item.created', { itemId: id('zzz') })],
        { person: names.person, contact: names.contact, room: names.room },
        member,
      )!.text,
    ).toBe('Kavya added something')
    expect(activityLine([row('run.created', { runId: id('r') })], names, member)!.text).toBe(
      'Kavya started a run',
    )
    expect(
      activityLine([row('contact.created', { contactId: id('x') })], names, member)!.text,
    ).toBe('Kavya added a contact to contacts')
  })
})

describe('what the feed hides', () => {
  it.each([
    'chore.undone',
    'feeling.removed',
    'poll.vote_withdrawn',
    'cost.splitwise_copied',
  ] as EventKind[])('%s is recorded but never shown', (kind) => {
    expect(
      activityLine(
        [row(kind, { itemId: id('i1'), pollId: id('p'), costId: id('c') })],
        names,
        admin,
      ),
    ).toBeNull()
  })

  it('shows invite activity to admins only', () => {
    const r = row('invite.created', { payload: { v: 1, maxUses: 2 } })
    expect(activityLine([r], names, member)).toBeNull()
    expect(activityLine([r], names, admin)!.text).toBe('Kavya made an invite link')
    expect(activityLine([row('invite.revoked')], names, admin)!.text).toBe(
      'Kavya turned off an invite link',
    )
  })
})

describe('grouping and paging', () => {
  it('groups rows by action, keeping the newest-first order', () => {
    const a = id<'action'>('A') as ActionId
    const b = id<'action'>('B') as ActionId
    const rows = [
      row('house.created', { actionId: b }),
      row('item.created', { actionId: a }),
      row('item.created', { actionId: a }),
    ].reverse()
    expect(groupByAction(rows).map((g) => g.map((r) => r.actionId))).toEqual([[a, a], [b]])
  })

  it('never splits an action across pages', () => {
    const a = id<'action'>('A') as ActionId
    const rows = [
      row('house.created'),
      row('item.created', { actionId: a }),
      row('item.created', { actionId: a }),
      row('item.created', { actionId: a }),
      row('contact.created'),
    ].reverse() // newest first: contact, a, a, a, house
    const first = pageAtActionBoundary(rows, 2)
    expect(first.rows.map((r) => r.kind)).toEqual([
      'contact.created',
      'item.created',
      'item.created',
      'item.created',
    ])
    expect(first.before).toBe(first.rows.at(-1)!.id)
    expect(pageAtActionBoundary(rows.slice(4), 2)).toEqual({ rows: rows.slice(4), before: null })
    expect(pageAtActionBoundary(rows.slice(1, 4), 1).before).toBeNull() // the action runs to the end
  })
})
