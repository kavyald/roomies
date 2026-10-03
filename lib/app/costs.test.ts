import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest } from '../compose'
import { monthlySpend, monthOf } from '../domain/costs'
import type { ItemId, UserId } from '../domain/ids'
import type { Cents } from '../domain/money'
import { sampleHouse } from '../testing/sample-house'
import { makeAddCost, makeCopiedToSplitwise, makeEditCost, makeRemoveCost } from './costs'
import { makeCreateItem } from './items'
import { makeFinishRun, makeStartRun } from './runs'

const setup = async () => {
  const deps = depsForTest()
  const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
  const as = (who: keyof typeof s.people) => asMember(s.house.id, s.people[who])
  return { deps, s, as }
}

describe('costs', () => {
  it('finishing a grocery run with $42.50 records one cost on the run, and Spent this month', async () => {
    const { deps, s, as } = await setup()
    const milk = await makeCreateItem(deps)(as('Wren'), { category: 'need', title: 'Milk' })
    if (!milk.ok) throw new Error(milk.error)
    const run = await makeStartRun(deps)(as('Wren'), { itemIds: [milk.value.id] })
    if (!run.ok) throw new Error(run.error)
    const finished = await makeFinishRun(deps)(as('Wren'), {
      runId: run.value.id,
      spent: 4250 as Cents,
    })
    expect(finished.ok && finished.value.cost).toMatchObject({
      amount: 4250,
      paidBy: s.people.Wren,
      for: { run: run.value.id },
    })
    const costs = deps.uow.state.costs
    expect(costs).toHaveLength(1)
    const tz = s.house.settings.timezone
    expect(monthlySpend(costs, 4, monthOf(deps.clock.now(), tz), tz)).toEqual({
      total: 4250,
      share: 1063,
    })
    expect(deps.uow.state.activity.map((a) => a.kind).slice(-3)).toEqual([
      'run.item_returned',
      'run.finished',
      'cost.added',
    ])
  })

  it('adds a cost on an item paid by someone else, and notes a Splitwise copy', async () => {
    const { deps, s, as } = await setup()
    const vacuum = await makeCreateItem(deps)(as('Wren'), { category: 'need', title: 'Vacuum' })
    if (!vacuum.ok) throw new Error(vacuum.error)
    const add = makeAddCost(deps)
    const cost = await add(as('Kavya'), {
      amount: 18900 as Cents,
      paidBy: s.people.Sam,
      for: { item: vacuum.value.id },
    })
    expect(cost.ok && cost.value).toMatchObject({ paidBy: s.people.Sam, createdBy: s.people.Kavya })
    if (!cost.ok) return
    expect((await makeCopiedToSplitwise(deps)(as('Sam'), { costId: cost.value.id })).ok).toBe(true)
    expect(deps.uow.state.activity.at(-1)).toMatchObject({
      kind: 'cost.splitwise_copied',
      itemId: vacuum.value.id,
    })

    expect(await add(as('Kavya'), { amount: 100 as Cents, paidBy: 'ghost' as UserId })).toEqual({
      ok: false,
      error: 'unknown_member',
    })
    expect(
      await add(as('Kavya'), { amount: 100 as Cents, for: { item: 'nope' as ItemId } }),
    ).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(await add(as('Kavya'), { amount: 0 as Cents })).toEqual({
      ok: false,
      error: 'not_positive',
    })
  })

  it('any member edits a cost or removes it, and Spent this month follows', async () => {
    const { deps, s, as } = await setup()
    const vacuum = await makeCreateItem(deps)(as('Wren'), { category: 'need', title: 'Vacuum' })
    if (!vacuum.ok) throw new Error(vacuum.error)
    const cost = await makeAddCost(deps)(as('Kavya'), {
      amount: 18900 as Cents,
      note: 'Dyson',
      for: { item: vacuum.value.id },
    })
    if (!cost.ok) throw new Error(cost.error)
    const costId = cost.value.id
    const tz = s.house.settings.timezone
    const month = monthOf(deps.clock.now(), tz)
    const spent = () => monthlySpend(deps.uow.state.costs, 4, month, tz).total

    const edit = makeEditCost(deps)
    const edited = await edit(as('Sam'), { costId, amount: 20000 as Cents, paidBy: s.people.Sam })
    expect(edited.ok && edited.value).toMatchObject({
      amount: 20000,
      paidBy: s.people.Sam,
      note: 'Dyson',
      createdBy: s.people.Kavya,
    })
    expect(spent()).toBe(20000)
    expect(deps.uow.state.activity.at(-1)).toMatchObject({
      kind: 'cost.edited',
      costId,
      itemId: vacuum.value.id,
      actorId: s.people.Sam,
      changes: { amount: [18900, 20000], paid_by: [s.people.Kavya, s.people.Sam] },
    })

    expect(await edit(as('Sam'), { costId, amount: 20000 as Cents })).toEqual({
      ok: false,
      error: 'no_change',
    })
    expect(await edit(as('Sam'), { costId, paidBy: 'ghost' as UserId })).toEqual({
      ok: false,
      error: 'unknown_member',
    })

    const remove = makeRemoveCost(deps)
    const removed = await remove(as('Wren'), { costId })
    expect(removed.ok && removed.value.removedAt).toEqual(deps.clock.now())
    expect(spent()).toBe(0)
    expect(deps.uow.state.activity.at(-1)).toMatchObject({
      kind: 'cost.removed',
      costId,
      itemId: vacuum.value.id,
      actorId: s.people.Wren,
    })
    expect(await remove(as('Wren'), { costId })).toEqual({ ok: false, error: 'already_removed' })
    expect(await edit(as('Wren'), { costId, note: 'x' })).toEqual({ ok: false, error: 'removed' })
  })

  it("can't reach another house's cost", async () => {
    const { deps, as } = await setup()
    const cost = await makeAddCost(deps)(as('Kavya'), { amount: 500 as Cents })
    if (!cost.ok) throw new Error(cost.error)
    const other = await sampleHouse(
      deps.uow,
      deps.ids,
      async () => deps.ids.newId<'user'>() as UserId,
    )
    const stranger = asMember(other.house.id, other.people.Kavya)
    const costId = cost.value.id
    expect(await makeEditCost(deps)(stranger, { costId, amount: 1 as Cents })).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(await makeRemoveCost(deps)(stranger, { costId })).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(await makeCopiedToSplitwise(deps)(stranger, { costId })).toEqual({
      ok: false,
      error: 'not_found',
    })
  })
})
