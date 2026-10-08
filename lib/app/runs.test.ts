import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest } from '../compose'
import type { ContactId, ItemId, RunId, UserId } from '../domain/ids'
import { itemPath } from '../domain/runs'
import type { LocalDate, LocalTime } from '../domain/time'
import type { Item } from '../domain/items'
import { sampleHouse } from '../testing/sample-house'
import { makeCreateItem, makeEditItem, makeMarkDone } from './items'
import { Conflict, type UnitOfWork } from './ports'
import { makeCreateContact } from './contacts'
import {
  makeAddToRequest,
  makeAddToRun,
  makeHandToContact,
  makeMoveToNewVisit,
  makePlanVisit,
  makeRenameRun,
  makeSendRequest,
  makeSetRunner,
  makeSetVisitDate,
  makeStartRequest,
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
    expect(finished).toMatchObject({ ok: true, value: { run: { state: { open: false } } } })
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

describe('renaming a run and changing its point person', () => {
  it('renames, hands over, and records both; a finished run stays as it was', async () => {
    const t = await setup()
    const [milk] = await t.needs('Milk')
    const run = await t.start(t.as('Kavya'), { itemIds: [milk!] })
    if (!run.ok) throw new Error(run.error)
    const rename = makeRenameRun(t.deps)
    const setRunner = makeSetRunner(t.deps)

    const named = await rename(t.as('Wren'), { runId: run.value.id, title: 'Saturday shop' })
    expect(named).toMatchObject({ ok: true, value: { title: 'Saturday shop' } })
    const handed = await setRunner(t.as('Wren'), {
      runId: run.value.id,
      runner: t.s.people.Wren,
    })
    expect(handed).toMatchObject({ ok: true, value: { runner: t.s.people.Wren } })
    expect(t.deps.uow.state.activity.slice(-2)).toMatchObject([
      { kind: 'run.renamed', changes: { title: [null, 'Saturday shop'] } },
      {
        kind: 'run.point_person_changed',
        memberId: t.s.people.Wren,
        changes: { runner: [t.s.people.Kavya, t.s.people.Wren] },
      },
    ])
    const usual = await rename(t.as('Kavya'), { runId: run.value.id, title: null })
    expect(usual.ok && usual.value).not.toHaveProperty('title')

    expect(
      await setRunner(t.as('Kavya'), { runId: run.value.id, runner: 'ghost' as UserId }),
    ).toEqual({ ok: false, error: 'unknown_member' })
    expect(await rename(t.as('Kavya'), { runId: 'nope' as RunId, title: 'x' })).toEqual({
      ok: false,
      error: 'not_found',
    })
    await t.finish(t.as('Wren'), { runId: run.value.id })
    expect(await rename(t.as('Kavya'), { runId: run.value.id, title: 'Late' })).toEqual({
      ok: false,
      error: 'finished',
    })
    expect(
      await setRunner(t.as('Kavya'), { runId: run.value.id, runner: t.s.people.Kavya }),
    ).toEqual({ ok: false, error: 'finished' })
  })
})

describe('requests and visits', () => {
  const tasks = async (
    t: Awaited<ReturnType<typeof setup>>,
    contactId: ContactId,
    ...titles: string[]
  ) => {
    const ids: ItemId[] = []
    for (const title of titles) {
      const r = await makeCreateItem(t.deps)(t.as('Wren'), {
        category: 'task',
        title,
        contactId,
      })
      if (!r.ok) throw new Error(r.error)
      ids.push(r.value.id)
    }
    return ids
  }

  it('Landlord list → sent → 2 tasks to a new visit and 1 back to the pool; the request closes itself', async () => {
    const t = await setup()
    const landlord = t.s.contacts.landlord.id
    const [leak, mold, window] = await tasks(t, landlord, 'Leak', 'Mold', 'Window')
    const addToList = makeAddToRequest(t.deps)
    const first = await addToList(t.as('Wren'), { taskId: leak! })
    await addToList(t.as('Kavya'), { taskId: mold! })
    await addToList(t.as('Kavya'), { taskId: window! })
    if (!first.ok) throw new Error(first.error)
    const req = first.value.id
    expect(new Set([leak, mold, window].map((i) => t.item(i!).run?.id))).toEqual(new Set([req]))

    const sent = await makeSendRequest(t.deps)(t.as('Kavya'), { runId: req, via: 'text' })
    expect(sent.ok && sent.value.message).toContain('1. Leak')
    expect(sent.ok && sent.value.run.state).toMatchObject({ at: 'sent', via: 'text' })
    expect(await addToList(t.as('Wren'), { taskId: leak! })).toMatchObject({
      error: 'already_on_a_run',
    })

    const visit = await makeMoveToNewVisit(t.deps)(t.as('Kavya'), {
      fromRunId: req,
      itemIds: [leak!, mold!],
      when: { date: '2026-10-01' as LocalDate, time: '10:00' as LocalTime },
      note: 'Sending a plumber Thu',
    })
    expect(visit.ok).toBe(true)
    const back = await t.back(t.as('Kavya'), {
      runId: req,
      itemIds: [window!],
      note: "That one's on us",
      clearContact: true,
    })
    expect(back).toMatchObject({ ok: true, value: { state: { at: 'closed' } } })
    expect(t.item(window!)).not.toHaveProperty('contactId')
    expect(t.item(leak!)).toMatchObject({ run: { kind: 'visit' }, contactId: landlord })

    // Each task's history shows its path.
    const path = (id: ItemId) =>
      itemPath(
        t.deps.uow.state.activity.filter((a) => a.itemId === id),
        id,
      ).map((s) => (typeof s.what === 'object' ? 'moved' : s.what))
    expect(path(leak!)).toEqual(['added', 'moved'])
    expect(path(window!)).toEqual(['added', 'returned'])
    expect(t.kinds()).toContain('request.closed')
  })

  it('hands tasks to another contact, plans a visit directly, and sets its date', async () => {
    const t = await setup()
    const landlord = t.s.contacts.landlord.id
    const plumber = await makeCreateContact(t.deps)(t.as('Kavya'), { name: 'Plumber' })
    if (!plumber.ok) throw new Error(plumber.error)
    const [leak, door] = await tasks(t, landlord, 'Leak', 'Door')
    const req = await makeStartRequest(t.deps)(t.as('Kavya'), {
      contactId: landlord,
      itemIds: [leak!],
    })
    if (!req.ok) throw new Error(req.error)
    const handed = await makeHandToContact(t.deps)(t.as('Kavya'), {
      runId: req.value.id,
      itemIds: [leak!],
      contactId: plumber.value.id,
      note: 'Call a plumber yourselves',
    })
    expect(handed.ok && handed.value[1]).toMatchObject({
      kind: 'request',
      contactId: plumber.value.id,
    })
    expect(t.item(leak!)).toMatchObject({ contactId: plumber.value.id })

    const visit = await makePlanVisit(t.deps)(t.as('Wren'), {
      contactId: landlord,
      itemIds: [door!],
    })
    if (!visit.ok) throw new Error(visit.error)
    const dated = await makeSetVisitDate(t.deps)(t.as('Wren'), {
      runId: visit.value.id,
      when: { date: '2026-10-02' as LocalDate },
    })
    expect(dated.ok && dated.value).toMatchObject({ when: { date: '2026-10-02' } })
    expect(
      await makeStartRequest(t.deps)(t.as('Wren'), { contactId: 'nope' as ContactId, itemIds: [] }),
    ).toEqual({ ok: false, error: 'not_found' })
  })
})

/** A unit of work whose first read of `stale.id` serves `stale`: the copy loaded just before
 * someone else's save landed, which is how two people moving the same thing at once look. */
const loadedBefore = (uow: UnitOfWork, stale: Item): UnitOfWork => ({
  run: (actor, fn) =>
    uow.run(actor, (repos) => {
      let served = false
      return fn({
        ...repos,
        items: {
          ...repos.items,
          get: async (id) => {
            if (id !== stale.id || served) return repos.items.get(id)
            served = true
            return stale
          },
        },
      })
    }),
})

describe('two people at once (§7.2c, §7.5)', () => {
  it('moving the same item: exactly one move is recorded, the other hears not_on_run', async () => {
    const t = await setup()
    const [milk] = await t.needs('Milk')
    const from = await t.start(t.as('Kavya'), { itemIds: [milk!] })
    const a = await t.start(t.as('Sam'), { itemIds: (await t.needs('Eggs'))! })
    const b = await t.start(t.as('Wren'), { itemIds: (await t.needs('Bread'))! })
    if (!from.ok || !a.ok || !b.ok) throw new Error('setup')
    const [first, second] = await Promise.all([
      t.move(t.as('Sam'), { fromRunId: from.value.id, toRunId: a.value.id, itemIds: [milk!] }),
      t.move(t.as('Wren'), { fromRunId: from.value.id, toRunId: b.value.id, itemIds: [milk!] }),
    ])
    expect(first).toMatchObject({ ok: true })
    expect(second).toMatchObject({ ok: false, error: 'not_on_run' })
    expect(t.kinds().filter((k) => k === 'run.item_moved')).toHaveLength(1)
    expect(t.item(milk!).run?.id).toBe(a.value.id)
  })

  it('a move that loaded the item before someone else moved it hears not_on_run, not a conflict', async () => {
    const t = await setup()
    const [milk] = await t.needs('Milk')
    const from = await t.start(t.as('Kavya'), { itemIds: [milk!] })
    const a = await t.start(t.as('Sam'), { itemIds: (await t.needs('Eggs'))! })
    if (!from.ok || !a.ok) throw new Error('setup')
    const stale = t.item(milk!)
    expect(
      await t.move(t.as('Sam'), {
        fromRunId: from.value.id,
        toRunId: a.value.id,
        itemIds: [milk!],
      }),
    ).toMatchObject({ ok: true })
    const late = { ...t.deps, uow: loadedBefore(t.deps.uow, stale) }
    const before = t.kinds()
    expect(
      await makeReturnToPool(late)(t.as('Wren'), {
        runId: from.value.id,
        itemIds: [milk!],
        clearContact: false,
      }),
    ).toEqual({ ok: false, error: 'not_on_run', detail: { itemId: milk } })
    expect(t.kinds()).toEqual(before)
    expect(t.item(milk!).run?.id).toBe(a.value.id)
  })

  it('an item added to a run while someone else was adding it elsewhere: already_on_a_run', async () => {
    const t = await setup()
    const [milk] = await t.needs('Milk')
    const stale = t.item(milk!)
    expect(await t.start(t.as('Kavya'), { itemIds: [milk!] })).toMatchObject({ ok: true })
    const late = { ...t.deps, uow: loadedBefore(t.deps.uow, stale) }
    expect(await makeStartRun(late)(t.as('Wren'), { itemIds: [milk!] })).toEqual({
      ok: false,
      error: 'already_on_a_run',
      detail: { itemId: milk },
    })
    expect(t.kinds().filter((k) => k === 'run.created')).toHaveLength(1)
  })

  it('an item that was only edited meanwhile is a plain conflict (the client refetches)', async () => {
    const t = await setup()
    const [milk] = await t.needs('Milk')
    const from = await t.start(t.as('Kavya'), { itemIds: [milk!] })
    if (!from.ok) throw new Error('setup')
    const stale = t.item(milk!)
    await makeEditItem(t.deps)(t.as('Sam'), { id: milk!, patch: { title: 'Oat milk' } })
    const late = { ...t.deps, uow: loadedBefore(t.deps.uow, stale) }
    await expect(
      makeMarkRunItemsDone(late)(t.as('Wren'), { runId: from.value.id, itemIds: [milk!] }),
    ).rejects.toBeInstanceOf(Conflict)
    expect(t.item(milk!)).toMatchObject({ title: 'Oat milk', run: { id: from.value.id } })
  })
})
