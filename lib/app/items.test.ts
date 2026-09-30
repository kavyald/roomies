import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest } from '../compose'
import type { UserId } from '../domain/ids'
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
} from './items'

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
