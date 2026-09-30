import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest } from '../compose'
import type { ItemId, RunId, UserId } from '../domain/ids'
import type { Item } from '../domain/items'
import { sampleHouse } from '../testing/sample-house'
import { makeCreateItem, makeMarkDone } from './items'
import {
  makeAddToRun,
  makeFinishRun,
  makeMarkRunItemsDone,
  makeMoveRunItems,
  makeReturnToPool,
  makeStartRun,
} from './runs'

const setup = async () => {
  const deps = depsForTest()
  const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
  const as = (who: keyof typeof s.people) => asMember(s.house.id, s.people[who])
  const create = makeCreateItem(deps)
  const needs = async (...titles: string[]) => {
    const ids: ItemId[] = []
    for (const title of titles) {
      const r = await create(as('Wren'), { category: 'need', title })
      if (!r.ok) throw new Error(r.error)
      ids.push(r.value.id)
    }
    return ids
  }
  const item = (id: ItemId) => deps.uow.state.items.get(id) as Item
  const kinds = () => deps.uow.state.activity.map((a) => a.kind)
  return {
    deps,
    s,
    as,
    needs,
    item,
    kinds,
    start: makeStartRun(deps),
    add: makeAddToRun(deps),
    done: makeMarkRunItemsDone(deps),
    move: makeMoveRunItems(deps),
    back: makeReturnToPool(deps),
    finish: makeFinishRun(deps),
  }
}

describe('runs, end to end on the memory adapters', () => {
  it('an item can be on only one run', async () => {
    const { as, needs, start, add, item } = await setup()
    const [milk, eggs] = await needs('Milk', 'Eggs')
    const first = await start(as('Kavya'), { itemIds: [milk!] })
    expect(first.ok).toBe(true)
    expect(item(milk!).run).toMatchObject({ kind: 'batch' })
    expect(await start(as('Wren'), { itemIds: [milk!, eggs!] })).toMatchObject({
      ok: false,
      error: 'already_on_a_run',
    })
    const second = await start(as('Wren'), { itemIds: [eggs!] })
    expect(
      second.ok && (await add(as('Wren'), { runId: second.value.id, itemIds: [milk!] })),
    ).toMatchObject({
      ok: false,
      error: 'already_on_a_run',
    })
  })

  it('selected items can be done, moved to another run, or put back with a note; finishing returns the rest', async () => {
    const { as, needs, start, done, move, back, finish, item, kinds, deps } = await setup()
    const [milk, eggs, soap, bread] = await needs('Milk', 'Eggs', 'Soap', 'Bread')
    const groceries = await start(as('Kavya'), {
      title: 'Groceries',
      itemIds: [milk!, eggs!, soap!, bread!],
    })
    const saturday = await start(as('Wren'), { itemIds: (await needs('Oat milk'))! })
    if (!groceries.ok || !saturday.ok) throw new Error('setup')
    const g = groceries.value.id

    expect((await done(as('Wren'), { runId: g, itemIds: [milk!] })).ok).toBe(true)
    expect(item(milk!)).toMatchObject({ done: { by: expect.any(String) } })
    expect(item(milk!).run).toBeUndefined()

    const moved = await move(as('Kavya'), {
      fromRunId: g,
      toRunId: saturday.value.id,
      itemIds: [eggs!],
      note: 'Sold out',
    })
    expect(moved.ok).toBe(true)
    expect(item(eggs!).run?.id).toBe(saturday.value.id)

    expect(
      (
        await back(as('Kavya'), {
          runId: g,
          itemIds: [soap!],
          note: 'We have some',
          clearContact: false,
        })
      ).ok,
    ).toBe(true)
    expect(item(soap!).run).toBeUndefined()

    const finished = await finish(as('Kavya'), { runId: g })
    expect(finished).toMatchObject({ ok: true, value: { state: { open: false } } })
    expect(item(bread!).run).toBeUndefined()
    expect(deps.uow.state.activity.at(-1)).toMatchObject({
      kind: 'run.finished',
      payload: { v: 1, done: 1, returned: 1 },
    })
    expect(kinds().filter((k) => k.startsWith('run.'))).toEqual([
      'run.created',
      'run.item_added',
      'run.item_added',
      'run.item_added',
      'run.item_added',
      'run.created',
      'run.item_added',
      'run.item_done',
      'run.item_moved',
      'run.item_returned',
      'run.item_returned', // the bread, "Not done this time"
      'run.finished',
    ])
    expect(await finish(as('Kavya'), { runId: g })).toEqual({ ok: false, error: 'finished' })
  })

  it('checking an item off on its own tab takes it off its run', async () => {
    const { deps, as, needs, start, item } = await setup()
    const [milk] = await needs('Milk')
    await start(as('Kavya'), { itemIds: [milk!] })
    expect((await makeMarkDone(deps)(as('Wren'), milk!)).ok).toBe(true)
    expect(item(milk!).run).toBeUndefined()
    expect(deps.uow.state.activity.at(-1)).toMatchObject({
      kind: 'item.done',
      runId: expect.any(String),
    })
  })

  it("another house's items and runs are not found", async () => {
    const { as, needs, start, move } = await setup()
    const other = await setup()
    const [theirs] = await other.needs('Milk')
    expect(await start(as('Kavya'), { itemIds: [theirs!] })).toEqual({
      ok: false,
      error: 'not_found',
    })
    const [mine] = await needs('Eggs')
    const run = await start(as('Kavya'), { itemIds: [mine!] })
    expect(
      run.ok &&
        (await move(as('Kavya'), {
          fromRunId: run.value.id,
          toRunId: 'nope' as RunId,
          itemIds: [mine!],
        })),
    ).toEqual({ ok: false, error: 'not_found' })
    expect(await start(as('Kavya'), { itemIds: [], runner: 'ghost' as UserId })).toEqual({
      ok: false,
      error: 'unknown_member',
    })
  })
})
