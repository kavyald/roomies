import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest } from '../compose'
import type { UserId } from '../domain/ids'
import { sampleHouse } from '../testing/sample-house'
import { makeCreateItem, makeEditItem, makeSetFeeling } from './items'
import { makeCreatePoll } from './polls'
import { makeStartRun } from './runs'

const setup = async () => {
  const deps = depsForTest()
  const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
  const as = (who: keyof typeof s.people) => asMember(s.house.id, s.people[who])
  const outbox = () => deps.uow.state.outbox
  const task = async (assignee?: keyof typeof s.people) => {
    const r = await makeCreateItem(deps)(as('Kavya'), {
      category: 'task',
      title: 'Leak under the sink',
      ...(assignee && { assignee: s.people[assignee] }),
    })
    if (!r.ok) throw new Error(r.error)
    return r.value
  }
  return { deps, s, as, outbox, task }
}

describe('the outbox, written with the events', () => {
  it('a 😰 feeling enqueues a message for the assignee', async () => {
    const t = await setup()
    const leak = await t.task('Wren')
    t.outbox().length = 0 // just the feeling's messages
    const r = await makeSetFeeling(t.deps)(t.as('Sam'), {
      itemId: leak.id,
      kind: 'anxious',
      note: 'Water on the floor',
    })
    expect(r.ok).toBe(true)
    expect(t.outbox()).toEqual([
      expect.objectContaining({
        userId: t.s.people.Wren,
        houseId: t.s.house.id,
        category: 'feelings',
        title: '😰 Sam feels anxious about Leak under the sink',
        body: 'Water on the floor',
        url: `/h/${t.s.house.id}/i/${leak.id}`,
      }),
    ])
  })

  it('assigning a task tells the new assignee', async () => {
    const t = await setup()
    const leak = await t.task()
    expect(t.outbox()).toEqual([])
    await makeEditItem(t.deps)(t.as('Kavya'), { id: leak.id, patch: { assignee: t.s.people.Jo } })
    expect(t.outbox().map((m) => [m.userId, m.category])).toEqual([[t.s.people.Jo, 'assigned']])
  })

  it('a new poll and a new run tell everyone else; turned-off categories are skipped', async () => {
    const t = await setup()
    await t.deps.uow.run(t.as('Wren'), (r) =>
      r.notifications.setEnabled(t.s.people.Wren, 'polls', false),
    )
    await makeCreatePoll(t.deps)(t.as('Kavya'), {
      question: 'House name?',
      options: [{ label: 'The Nest' }, { label: 'Burrow' }],
    })
    expect(
      t
        .outbox()
        .map((m) => m.userId)
        .sort(),
    ).toEqual([t.s.people.Sam, t.s.people.Jo].sort())
    t.outbox().length = 0
    const milk = await makeCreateItem(t.deps)(t.as('Jo'), { category: 'need', title: 'Milk' })
    if (!milk.ok) throw new Error(milk.error)
    await makeStartRun(t.deps)(t.as('Jo'), { itemIds: [milk.value.id] })
    expect(t.outbox().map((m) => [m.userId, m.title, m.body])).toEqual(
      (['Kavya', 'Sam', 'Wren'] as const)
        .map((n) => t.s.people[n])
        .sort()
        .map((u) => [u, "Jo is starting Jo's run", 'Add anything?']),
    )
  })

  it('nothing is enqueued when the use case fails (same transaction)', async () => {
    const t = await setup()
    const r = await makeSetFeeling(t.deps)(t.as('Sam'), {
      itemId: 'nope' as never,
      kind: 'anxious',
    })
    expect(r.ok).toBe(false)
    expect(t.outbox()).toEqual([])
  })
})
