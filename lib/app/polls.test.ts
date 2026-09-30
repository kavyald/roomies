import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest } from '../compose'
import type { ItemId, OptionId, PollId, UserId } from '../domain/ids'
import { sampleHouse } from '../testing/sample-house'
import { makeCreateItem } from './items'
import { makeAddPollOption, makeClosePoll, makeCreatePoll, makeVote } from './polls'

const setup = async () => {
  const deps = depsForTest()
  const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
  const as = (who: keyof typeof s.people) => asMember(s.house.id, s.people[who])
  return {
    deps,
    s,
    as,
    create: makeCreatePoll(deps),
    vote: makeVote(deps),
    add: makeAddPollOption(deps),
    close: makeClosePoll(deps),
    kinds: () => deps.uow.state.activity.map((a) => a.kind),
  }
}

describe('polls, end to end on the memory adapters', () => {
  it('"Which vacuum?" on a need: vote, change a vote, add an option, close with a winner', async () => {
    const t = await setup()
    const need = await makeCreateItem(t.deps)(t.as('Wren'), { category: 'need', title: 'Vacuum' })
    if (!need.ok) throw new Error(need.error)
    const p = await t.create(t.as('Wren'), {
      question: 'Which vacuum?',
      itemId: need.value.id,
      options: [{ label: 'Dyson V8', note: '$189' }, { label: 'Shark' }],
    })
    if (!p.ok) throw new Error(p.error)
    const [dyson, shark] = p.value.options.map((o) => o.id)
    for (const who of ['Kavya', 'Wren', 'Sam'] as const)
      expect((await t.vote(t.as(who), { pollId: p.value.id, optionId: dyson! })).ok).toBe(true)
    expect((await t.vote(t.as('Sam'), { pollId: p.value.id, optionId: shark! })).ok).toBe(true)
    const added = await t.add(t.as('Jo'), { pollId: p.value.id, label: 'Bissell' })
    expect(added.ok && added.value.options.map((o) => o.label)).toEqual([
      'Dyson V8',
      'Shark',
      'Bissell',
    ])
    const closed = await t.close(t.as('Jo'), { pollId: p.value.id })
    expect(closed.ok && closed.value.result).toEqual({ winner: dyson, votes: 2, runnerUp: 1 })
    expect(await t.vote(t.as('Jo'), { pollId: p.value.id, optionId: shark! })).toEqual({
      ok: false,
      error: 'closed',
    })
    expect(t.kinds().filter((k) => k.startsWith('poll.'))).toEqual([
      'poll.created',
      'poll.voted',
      'poll.voted',
      'poll.voted',
      'poll.vote_changed',
      'poll.option_added',
      'poll.closed',
    ])
  })

  it('a standalone "House name?" can end 2–2 in a tie', async () => {
    const t = await setup()
    const p = await t.create(t.as('Kavya'), {
      question: 'House name?',
      options: [{ label: 'The Nest' }, { label: 'Burrow' }],
    })
    if (!p.ok) throw new Error(p.error)
    const [nest, burrow] = p.value.options.map((o) => o.id)
    const votes: [keyof typeof t.s.people, OptionId][] = [
      ['Kavya', nest!],
      ['Wren', burrow!],
      ['Sam', nest!],
      ['Jo', burrow!],
    ]
    for (const [who, o] of votes) await t.vote(t.as(who), { pollId: p.value.id, optionId: o })
    const closed = await t.close(t.as('Kavya'), { pollId: p.value.id })
    expect(closed.ok && closed.value.result).toEqual({ tie: [nest, burrow], votes: 2 })
  })

  it("another house's polls and items are not found", async () => {
    const t = await setup()
    const other = await setup()
    const theirs = await other.create(other.as('Kavya'), {
      question: 'Theirs?',
      options: [{ label: 'A' }, { label: 'B' }],
    })
    if (!theirs.ok) throw new Error(theirs.error)
    expect(
      await t.vote(t.as('Kavya'), {
        pollId: theirs.value.id,
        optionId: theirs.value.options[0]!.id,
      }),
    ).toEqual({ ok: false, error: 'not_found' })
    expect(await t.close(t.as('Kavya'), { pollId: 'nope' as PollId })).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(
      await t.create(t.as('Kavya'), {
        question: 'About theirs?',
        itemId: 'nope' as ItemId,
        options: [{ label: 'A' }, { label: 'B' }],
      }),
    ).toEqual({ ok: false, error: 'not_found' })
    expect(await t.create(t.as('Kavya'), { question: 'One?', options: [{ label: 'A' }] })).toEqual({
      ok: false,
      error: 'needs_two_options',
    })
  })
})
