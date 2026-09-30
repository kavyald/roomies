import { describe, expect, it } from 'vitest'
import {
  asId,
  type ActionId,
  type HouseId,
  type ItemId,
  type OptionId,
  type PollId,
  type UserId,
} from './ids'
import {
  addPollOption,
  closePoll,
  createPoll,
  isPollOpen,
  resultLine,
  resultOf,
  tally,
  vote,
  type Poll,
} from './polls'
import { instant } from './time'

const user = (u: string) => asId<'user'>(u) as UserId
const kavya = user('kavya')
const wren = user('wren')
const sam = user('sam')
const jo = user('jo')
const T = instant(1_000)
const act = asId<'action'>('a') as ActionId
const opt = (s: string) => asId<'option'>(s) as OptionId
const ctx = (by: UserId = kavya) => ({ by, now: T, actionId: act })
const create = (options: { label: string; note?: string }[], question = 'Which vacuum?') =>
  createPoll(
    { question, options, itemId: asId<'item'>('vacuum') as ItemId },
    {
      ...ctx(),
      id: asId<'poll'>('p') as PollId,
      houseId: asId<'house'>('h') as HouseId,
      optionIds: options.map((o) => opt(o.label.trim().toLowerCase())),
    },
  )

const vacuum = (): Poll => {
  const r = create([{ label: 'Dyson V8', note: '$189' }, { label: 'Shark' }])
  if (!r.ok) throw new Error(r.error)
  return r.value.poll
}
const castAll = (p: Poll, votes: [UserId, string][]) =>
  votes.reduce((poll, [by, o]) => {
    const r = vote(poll, opt(o), ctx(by))
    if (!r.ok) throw new Error(r.error)
    return r.value.poll
  }, p)

describe('createPoll', () => {
  it('asks a question about an item, with two or more options', () => {
    const r = create([{ label: ' Dyson V8 ', note: ' $189 ' }, { label: 'Shark' }, { label: '  ' }])
    expect(r.ok && r.value.poll).toMatchObject({
      question: 'Which vacuum?',
      itemId: 'vacuum',
      options: [
        { id: 'dyson v8', label: 'Dyson V8', note: '$189', addedBy: kavya },
        { id: 'shark', label: 'Shark' },
      ],
      votes: [],
      state: { open: true },
    })
    expect(r.ok && r.value.events).toEqual([
      { kind: 'poll.created', pollId: 'p', itemId: 'vacuum', actionId: act, by: kavya },
    ])
  })

  it('refuses a blank question, fewer than two options, duplicates, and overlong text', () => {
    expect(create([{ label: 'A' }, { label: 'B' }], '  ')).toMatchObject({
      error: 'empty_question',
    })
    expect(create([{ label: 'A' }, { label: 'B' }], 'x'.repeat(201))).toMatchObject({
      error: 'question_too_long',
    })
    expect(create([{ label: 'A' }, { label: ' ' }])).toMatchObject({ error: 'needs_two_options' })
    expect(create([{ label: 'Dyson' }, { label: 'dyson ' }])).toMatchObject({
      error: 'duplicate_label',
    })
    expect(create([{ label: 'x'.repeat(81) }, { label: 'B' }])).toMatchObject({
      error: 'label_too_long',
    })
    expect(create([{ label: 'A', note: 'x'.repeat(281) }, { label: 'B' }])).toMatchObject({
      error: 'note_too_long',
    })
  })
})

describe('voting', () => {
  it('one vote each, and changing it replaces it', () => {
    const p = vacuum()
    const first = vote(p, opt('dyson v8'), ctx(wren))
    expect(first.ok && first.value.events[0]).toMatchObject({
      kind: 'poll.voted',
      optionId: 'dyson v8',
    })
    const changed = first.ok && vote(first.value.poll, opt('shark'), ctx(wren))
    expect(changed && changed.ok && changed.value.poll.votes).toEqual([
      { user: wren, option: 'shark', at: T },
    ])
    expect(changed && changed.ok && changed.value.events[0]).toMatchObject({
      kind: 'poll.vote_changed',
      changes: { option: ['dyson v8', 'shark'] },
    })
    expect(first.ok && vote(first.value.poll, opt('dyson v8'), ctx(wren))).toMatchObject({
      error: 'no_change',
    })
    expect(vote(p, opt('nope'), ctx(wren))).toMatchObject({ error: 'unknown_option' })
  })

  it("closed polls, and polls past their deadline, don't take votes or options", () => {
    const closed = closePoll(vacuum(), ctx())
    expect(closed.ok && vote(closed.value.poll, opt('shark'), ctx(wren))).toMatchObject({
      error: 'closed',
    })
    expect(
      closed.ok &&
        addPollOption(closed.value.poll, { label: 'Bissell' }, { ...ctx(), id: opt('b') }),
    ).toMatchObject({ error: 'closed' })
    const due = { ...vacuum(), closesAt: instant(500) }
    expect(isPollOpen(due, T)).toBe(false)
    expect(isPollOpen({ ...due, closesAt: instant(5_000) }, T)).toBe(true)
    expect(vote(due, opt('shark'), ctx(wren))).toMatchObject({ error: 'closed' })
    expect(closePoll(closed.ok ? closed.value.poll : vacuum(), ctx())).toMatchObject({
      error: 'already_closed',
    })
  })
})

describe('adding options', () => {
  it('anyone can add one while it is open; votes stay, and voters can switch', () => {
    const p = castAll(vacuum(), [[wren, 'shark']])
    const r = addPollOption(
      p,
      { label: 'Bissell', note: 'On sale' },
      { ...ctx(sam), id: opt('bissell') },
    )
    expect(r.ok && r.value.option).toEqual({
      id: 'bissell',
      label: 'Bissell',
      note: 'On sale',
      addedBy: sam,
      addedAt: T,
    })
    expect(r.ok && r.value.poll.votes).toEqual(p.votes)
    expect(r.ok && vote(r.value.poll, opt('bissell'), ctx(wren)).ok).toBe(true)
    expect(addPollOption(p, { label: ' shark' }, { ...ctx(), id: opt('x') })).toMatchObject({
      error: 'duplicate_label',
    })
    expect(addPollOption(p, { label: '' }, { ...ctx(), id: opt('x') })).toMatchObject({
      error: 'empty_label',
    })
  })
})

describe('results', () => {
  it('the most votes wins', () => {
    const p = castAll(vacuum(), [
      [kavya, 'dyson v8'],
      [wren, 'dyson v8'],
      [sam, 'dyson v8'],
      [jo, 'shark'],
    ])
    expect(tally(p)).toEqual([
      { option: 'dyson v8', votes: 3 },
      { option: 'shark', votes: 1 },
    ])
    const r = closePoll(p, ctx())
    expect(r.ok && r.value.result).toEqual({ winner: 'dyson v8', votes: 3, runnerUp: 1 })
    expect(r.ok && r.value.events[0]).toMatchObject({
      kind: 'poll.closed',
      optionId: 'dyson v8',
      payload: { result: 'winner' },
    })
  })

  it('a 2–2 result is a tie, and nothing happens automatically', () => {
    const p = castAll(vacuum(), [
      [kavya, 'dyson v8'],
      [wren, 'shark'],
      [sam, 'dyson v8'],
      [jo, 'shark'],
    ])
    expect(resultOf(p)).toEqual({ tie: ['dyson v8', 'shark'], votes: 2 })
    const r = closePoll(p, ctx())
    expect(r.ok && r.value.events[0]).toMatchObject({ payload: { result: 'tie' } })
    expect(r.ok && r.value.events[0]).not.toHaveProperty('optionId')
  })

  it('no votes is no result', () => {
    expect(resultOf(vacuum())).toEqual({ noVotes: true })
    const r = closePoll(vacuum(), { ...ctx(), by: null })
    expect(r.ok && r.value.events[0]).toMatchObject({ payload: { result: 'no_votes' }, by: null })
  })
})

describe('resultLine', () => {
  it('says who won, that it tied, or that nobody voted', () => {
    const p = vacuum()
    expect(resultLine(p, { winner: opt('dyson v8'), votes: 3, runnerUp: 1 })).toBe(
      'Dyson V8 wins (3–1)',
    )
    expect(resultLine(p, { tie: [opt('dyson v8'), opt('shark')], votes: 2 })).toBe(
      "It's a tie. Talk it out?",
    )
    expect(resultLine(p, { noVotes: true })).toBe('No votes this time.')
    expect(resultLine(p, { winner: opt('gone'), votes: 1, runnerUp: 0 })).toBe(
      'An option wins (1–0)',
    )
  })
})
