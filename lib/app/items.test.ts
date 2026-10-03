import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest, TEST_NOW } from '../compose'
import type { UserId } from '../domain/ids'
import { plusMs } from '../domain/time'
import { sampleHouse } from '../testing/sample-house'
import {
  makeArchiveItem,
  makeCreateItem,
  makeDoChore,
  makeEditItem,
  makeMarkDone,
  makeReopenItem,
  makeRestoreItem,
  makeSetFeeling,
  makeUndoChore,
} from './items'
import { makeAddToRequest } from './runs'

const setup = async () => {
  const deps = depsForTest()
  const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
  const as = (who: keyof typeof s.people) => asMember(s.house.id, s.people[who])
  return {
    deps,
    s,
    as,
    create: makeCreateItem(deps),
    edit: makeEditItem(deps),
    done: makeMarkDone(deps),
    reopen: makeReopenItem(deps),
    did: makeDoChore(deps),
    archive: makeArchiveItem(deps),
    restore: makeRestoreItem(deps),
    feel: makeSetFeeling(deps),
    kinds: () => deps.uow.state.activity.map((a) => a.kind),
  }
}

describe('items, end to end on the memory adapters', () => {
  it('adds a need, points a second "tomatoes" at the first, gets it, and undoes', async () => {
    const { s, as, create, done, reopen, kinds } = await setup()
    const first = await create(as('Wren'), {
      category: 'need',
      title: 'tomatoes',
      roomId: s.rooms.Kitchen!.id,
    })
    if (!first.ok) throw new Error(first.error)
    const again = await create(as('Sam'), { category: 'need', title: 'Tomatoes' })
    expect(again).toEqual({
      ok: false,
      error: 'duplicate_need',
      detail: { existingId: first.value.id },
    })

    const got = await done(as('Sam'), first.value.id)
    expect(got.ok && got.value).toMatchObject({ done: { by: s.people.Sam } })
    // Once it's got, "tomatoes" can go back on the list.
    const next = await create(as('Sam'), { category: 'need', title: 'tomatoes' })
    expect(next.ok).toBe(true)
    // …which is why undoing the first now points at the new one.
    expect(await reopen(as('Sam'), first.value.id)).toMatchObject({
      ok: false,
      error: 'duplicate_need',
    })
    expect(kinds()).toEqual(['item.created', 'item.done', 'item.created'])
  })

  it('does a chore (never "done"), and refuses to mark a chore done', async () => {
    const { s, as, create, did, done } = await setup()
    const trash = await create(as('Jo'), {
      category: 'chore',
      title: 'Trash',
      repeatDays: 7,
      assignee: s.people.Jo,
    })
    if (!trash.ok) throw new Error(trash.error)
    const r = await did(as('Wren'), trash.value.id)
    expect(r.ok && r.value).toMatchObject({ lastDone: { by: s.people.Wren } })
    expect(await done(as('Wren'), trash.value.id)).toEqual({ ok: false, error: 'not_for_chores' })
  })

  it('undoes Did it back to the last done before, unless it was done again since', async () => {
    let now = TEST_NOW
    const deps = depsForTest({ clock: { now: () => now } })
    const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
    const as = (who: keyof typeof s.people) => asMember(s.house.id, s.people[who])
    const [create, did, undo] = [makeCreateItem(deps), makeDoChore(deps), makeUndoChore(deps)]
    const later = (h: number) => (now = plusMs(TEST_NOW, h * 3_600_000))

    const trash = await create(as('Jo'), { category: 'chore', title: 'Trash', repeatDays: 7 })
    if (!trash.ok) throw new Error(trash.error)
    const id = trash.value.id

    // Never done → Did it → Undo: never done again.
    const first = await did(as('Wren'), id)
    expect(await undo(as('Wren'), { id, doneAt: TEST_NOW })).toMatchObject({ ok: true })
    expect(deps.uow.state.items.get(id)).not.toHaveProperty('lastDone')
    expect(first.ok).toBe(true)

    // Jo did it; later Wren did it and undoes: back to Jo's.
    await did(as('Jo'), id)
    later(1)
    const wrens = await did(as('Wren'), id)
    const undone = await undo(as('Wren'), { id, doneAt: now })
    expect(wrens.ok && undone.ok && undone.value).toMatchObject({
      lastDone: { at: TEST_NOW, by: s.people.Jo },
    })
    // A second Undo: the last done is Jo's now, not Wren's.
    expect(await undo(as('Wren'), { id, doneAt: now })).toEqual({
      ok: false,
      error: 'done_again',
    })

    // Wren did it, then Sam did it again before Wren's Undo: Sam's stays.
    later(2)
    const wrenAt = now
    await did(as('Wren'), id)
    later(3)
    await did(as('Sam'), id)
    expect(await undo(as('Wren'), { id, doneAt: wrenAt })).toEqual({
      ok: false,
      error: 'done_again',
    })
    expect(deps.uow.state.items.get(id)).toMatchObject({ lastDone: { by: s.people.Sam } })

    // Activity keeps every row (append-only); the undo only adds.
    expect(
      deps.uow.state.activity.filter((r) => r.itemId === id).map((r) => [r.kind, r.changes]),
    ).toEqual([
      ['item.created', undefined],
      ['chore.done', { lastDone: [null, { at: TEST_NOW, by: s.people.Wren }] }],
      ['chore.undone', { lastDone: [{ at: TEST_NOW, by: s.people.Wren }, null] }],
      ['chore.done', { lastDone: [null, { at: TEST_NOW, by: s.people.Jo }] }],
      ['chore.done', expect.anything()],
      ['chore.undone', expect.anything()],
      ['chore.done', expect.anything()],
      ['chore.done', expect.anything()],
    ])
  })

  it('Undo is for chores only, in this house', async () => {
    const { deps, as, create } = await setup()
    const milk = await create(as('Sam'), { category: 'need', title: 'Milk' })
    if (!milk.ok) throw new Error(milk.error)
    const undo = makeUndoChore(deps)
    expect(await undo(as('Sam'), { id: milk.value.id, doneAt: TEST_NOW })).toEqual({
      ok: false,
      error: 'not_a_chore',
    })
    const other = await sampleHouse(
      deps.uow,
      deps.ids,
      async () => deps.ids.newId<'user'>() as UserId,
    )
    const theirs = await create(asMember(other.house.id, other.people.Sam), {
      category: 'chore',
      title: 'Mop',
      repeatDays: null,
    })
    if (!theirs.ok) throw new Error(theirs.error)
    await makeDoChore(deps)(asMember(other.house.id, other.people.Sam), theirs.value.id)
    expect(await undo(as('Sam'), { id: theirs.value.id, doneAt: TEST_NOW })).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('edits a task, handing it to the super, and archives and restores it', async () => {
    const { deps, s, as, create, edit, archive, restore, kinds } = await setup()
    const leak = await create(as('Kavya'), { category: 'task', title: 'Leak under the sink' })
    if (!leak.ok) throw new Error(leak.error)
    const handed = await edit(as('Kavya'), {
      id: leak.value.id,
      patch: { contactId: s.contacts.super.id, assignee: s.people.Sam },
    })
    expect(handed.ok && handed.value).toMatchObject({
      contactId: s.contacts.super.id,
      assignee: s.people.Sam,
    })
    expect(await archive(as('Sam'), leak.value.id)).toMatchObject({ ok: true })
    expect(await restore(as('Sam'), leak.value.id)).toMatchObject({ ok: true })
    expect(kinds()).toEqual([
      'item.created',
      'item.assigned',
      'item.handled_by_changed',
      'item.archived',
      'item.restored',
    ])
    expect(deps.uow.state.items.get(leak.value.id)).not.toHaveProperty('archivedAt')
  })

  it('keeps "handled by" with the request a task is on, and says which run to move it from', async () => {
    const { deps, s, as, create, edit, kinds } = await setup()
    const leak = await create(as('Kavya'), {
      category: 'task',
      title: 'Leak under the sink',
      contactId: s.contacts.landlord.id,
    })
    if (!leak.ok) throw new Error(leak.error)
    const req = await makeAddToRequest(deps)(as('Kavya'), { taskId: leak.value.id })
    if (!req.ok) throw new Error(req.error)
    const before = kinds()

    expect(
      await edit(as('Sam'), { id: leak.value.id, patch: { contactId: s.contacts.super.id } }),
    ).toEqual({ ok: false, error: 'on_a_run', detail: { runId: req.value.id } })
    expect(await edit(as('Sam'), { id: leak.value.id, patch: { contactId: null } })).toMatchObject({
      ok: false,
      error: 'on_a_run',
    })
    // Nothing changed or was recorded.
    expect(deps.uow.state.items.get(leak.value.id)).toMatchObject({
      contactId: s.contacts.landlord.id,
    })
    expect(kinds()).toEqual(before)
    // Other edits still go through.
    expect(
      await edit(as('Sam'), { id: leak.value.id, patch: { title: 'Leak under the sink!' } }),
    ).toMatchObject({ ok: true })
  })

  it('two roommates edit the same task: the second hears "conflict" and nothing of theirs is saved (§7.5)', async () => {
    const { deps, as, create, edit, kinds } = await setup()
    const leak = await create(as('Kavya'), { category: 'task', title: 'Leak under the sink' })
    if (!leak.ok) throw new Error(leak.error)
    const id = leak.value.id
    const stored = () => deps.uow.state.items.get(id)!
    // Sam and Wren both open Edit on the same copy.
    const opened = stored().version
    expect(opened).toEqual(expect.any(String))
    expect(
      await edit(as('Sam'), {
        id,
        patch: { title: 'Leak under the bathroom sink' },
        version: opened,
      }),
    ).toMatchObject({ ok: true })
    expect(stored().version).not.toEqual(opened)
    const before = kinds()
    expect(
      await edit(as('Wren'), { id, patch: { title: 'Leak!', note: 'Dripping' }, version: opened }),
    ).toEqual({ ok: false, error: 'conflict' })
    expect(stored()).toMatchObject({ title: 'Leak under the bathroom sink' })
    expect(stored()).not.toHaveProperty('note')
    expect(kinds()).toEqual(before)
    // From the latest copy, Wren's edit goes through.
    expect(
      await edit(as('Wren'), { id, patch: { note: 'Dripping' }, version: stored().version }),
    ).toMatchObject({ ok: true })
    expect(stored()).toMatchObject({ title: 'Leak under the bathroom sink', note: 'Dripping' })
  })

  it('only points at people, rooms, and contacts of this house', async () => {
    const { deps, as, create } = await setup()
    const other = await sampleHouse(
      deps.uow,
      deps.ids,
      async () => deps.ids.newId<'user'>() as UserId,
    )
    expect(
      await create(as('Kavya'), { category: 'task', title: 'x', assignee: other.people.Sam }),
    ).toEqual({ ok: false, error: 'unknown_member' })
    expect(
      await create(as('Kavya'), { category: 'task', title: 'x', roomId: other.rooms.Kitchen!.id }),
    ).toEqual({ ok: false, error: 'unknown_room' })
    expect(
      await create(as('Kavya'), {
        category: 'task',
        title: 'x',
        contactId: other.contacts.super.id,
      }),
    ).toEqual({ ok: false, error: 'unknown_contact' })
  })

  it("can't reach another house's items", async () => {
    const { deps, as, create, done } = await setup()
    const other = await sampleHouse(
      deps.uow,
      deps.ids,
      async () => deps.ids.newId<'user'>() as UserId,
    )
    const theirs = await create(asMember(other.house.id, other.people.Sam), {
      category: 'need',
      title: 'Cake',
    })
    if (!theirs.ok) throw new Error(theirs.error)
    expect(await done(as('Kavya'), theirs.value.id)).toEqual({ ok: false, error: 'not_found' })
  })
})

describe('feelings', () => {
  it('shares, changes (keeping the old one in activity), and removes a feeling', async () => {
    const { deps, s, as, create, feel } = await setup()
    const radiator = await create(as('Kavya'), { category: 'task', title: 'Radiator clanking' })
    if (!radiator.ok) throw new Error(radiator.error)
    const first = await feel(as('Sam'), {
      itemId: radiator.value.id,
      kind: 'anxious',
      note: 'Up at 3am again',
    })
    expect(first.ok && first.value).toMatchObject({ kind: 'anxious', by: s.people.Sam })
    await feel(as('Sam'), { itemId: radiator.value.id, kind: 'frustrated' })
    expect(await feel(as('Sam'), { itemId: radiator.value.id, kind: 'frustrated' })).toEqual({
      ok: false,
      error: 'no_change',
    })
    expect(await feel(as('Sam'), { itemId: radiator.value.id, kind: null })).toEqual({
      ok: true,
      value: null,
    })

    const rows = deps.uow.state.activity.filter(
      (a) => a.itemId === radiator.value.id && a.kind.startsWith('feeling.'),
    )
    expect(
      rows.map((r) => [
        r.kind,
        (r.changes as { previous: { kind: string } | null }).previous?.kind ?? null,
      ]),
    ).toEqual([
      ['feeling.set', null],
      ['feeling.set', 'anxious'],
      ['feeling.removed', 'frustrated'],
    ])
    expect(deps.uow.state.feelings.size).toBe(0)
  })
})

describe('a need for me or for the house (T45)', () => {
  it('is for whoever adds it, can change hands, and only names housemates', async () => {
    const { deps, s, as, create, edit, kinds } = await setup()
    const mine = await create(as('Wren'), { category: 'need', title: 'Oat milk', forMe: true })
    expect(mine.ok && mine.value).toMatchObject({ forMember: s.people.Wren })
    // The house's oat milk is a different need.
    expect((await create(as('Sam'), { category: 'need', title: 'oat milk' })).ok).toBe(true)
    if (!mine.ok) throw new Error(mine.error)

    const other = await sampleHouse(
      deps.uow,
      deps.ids,
      async () => deps.ids.newId<'user'>() as UserId,
    )
    expect(
      await edit(as('Sam'), { id: mine.value.id, patch: { forMember: other.people.Sam } }),
    ).toEqual({ ok: false, error: 'unknown_member' })
    expect(
      await edit(as('Sam'), { id: mine.value.id, patch: { forMember: s.people.Sam } }),
    ).toMatchObject({ ok: true, value: { forMember: s.people.Sam } })
    expect(kinds().at(-1)).toBe('item.edited')
    expect(deps.uow.state.activity.at(-1)?.changes).toEqual({
      for_member: [s.people.Wren, s.people.Sam],
    })
  })
})
