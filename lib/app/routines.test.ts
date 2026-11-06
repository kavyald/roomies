import { describe, expect, it } from 'vitest'
import { asMember } from '../adapters/contracts/unit-of-work.contract'
import { depsForTest, TEST_NOW } from '../compose'
import type { RoomId, UserId } from '../domain/ids'
import { routineHolder } from '../domain/routines'
import { localDateOf, plusMs } from '../domain/time'
import { sampleHouse } from '../testing/sample-house'
import { makeMoveOut } from './house'
import { makeCreateItem } from './items'
import { makeRunReminders } from './jobs'
import { makeCreateRoutine, makeEditRoutine, makeRemoveRoutine } from './routines'

const setup = async () => {
  let now = TEST_NOW
  const deps = depsForTest({ clock: { now: () => now } })
  const s = await sampleHouse(deps.uow, deps.ids, async () => deps.ids.newId<'user'>() as UserId)
  const as = (who: keyof typeof s.people) => asMember(s.house.id, s.people[who])
  const rooms = (...names: (keyof typeof s.rooms)[]) => names.map((n) => s.rooms[n]!.id as RoomId)
  return {
    deps,
    s,
    as,
    rooms,
    create: makeCreateRoutine(deps),
    edit: makeEditRoutine(deps),
    remove: makeRemoveRoutine(deps),
    setNow: (ms: number) => (now = plusMs(TEST_NOW, ms)),
    stored: () => [...deps.uow.state.rooms.values()],
    kinds: () => deps.uow.state.activity.map((a) => a.kind),
  }
}

const NEW = { name: 'Kitchen', icon: 'utensils', resets: 'weekly' } as const

describe('routines', () => {
  it('any member creates one with its rooms, and activity shows each', async () => {
    const { s, as, rooms, create, stored, kinds } = await setup()
    const r = await create(as('Sam'), {
      ...NEW,
      who: { takesTurns: true, startsWith: s.people.Wren },
      roomIds: rooms('Kitchen'),
    })
    if (!r.ok) throw new Error(r.error)
    expect(stored().find((x) => x.id === s.rooms.Kitchen!.id)!.routineId).toBe(r.value.id)
    expect(kinds()).toEqual(expect.arrayContaining(['routine.created', 'room.routine_changed']))
  })

  it('refuses a room that is not this house’s, and numbers routines in order', async () => {
    const { s, as, rooms, create } = await setup()
    const who = { takesTurns: true, startsWith: s.people.Wren } as const
    expect(await create(as('Sam'), { ...NEW, who, roomIds: ['nope' as RoomId] })).toEqual({
      ok: false,
      error: 'unknown_room',
    })
    const first = await create(as('Sam'), { ...NEW, who, roomIds: rooms('Kitchen') })
    const second = await create(as('Sam'), { ...NEW, name: 'Bath', who, roomIds: [] })
    expect(first.ok && first.value.sortOrder).toBe(0)
    expect(second.ok && second.value.sortOrder).toBe(1)
  })

  it('edits the routine, its rooms, or both; a room moves from another routine', async () => {
    const { s, as, rooms, create, edit, stored, kinds } = await setup()
    const who = { takesTurns: true, startsWith: s.people.Wren } as const
    const a = await create(as('Sam'), { ...NEW, who, roomIds: rooms('Kitchen') })
    const b = await create(as('Sam'), { ...NEW, name: 'Other', who, roomIds: [] })
    if (!a.ok || !b.ok) throw new Error('create')
    const moved = await edit(as('Jo'), { id: b.value.id, patch: { roomIds: rooms('Kitchen') } })
    expect(moved.ok).toBe(true)
    expect(stored().find((x) => x.id === s.rooms.Kitchen!.id)!.routineId).toBe(b.value.id)
    expect(kinds().filter((k) => k === 'routine.updated')).toEqual([])
    const named = await edit(as('Jo'), { id: b.value.id, patch: { name: 'Kitchen now' } })
    expect(named.ok && named.value.name).toBe('Kitchen now')
    expect(await edit(as('Jo'), { id: b.value.id, patch: { roomIds: rooms('Kitchen') } })).toEqual({
      ok: false,
      error: 'no_change',
    })
    expect(
      await edit(as('Jo'), { id: b.value.id, patch: { roomIds: ['nope' as RoomId] } }),
    ).toEqual({ ok: false, error: 'unknown_room' })
    expect(await edit(as('Jo'), { id: 'nope' as never, patch: { name: 'x' } })).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('removing keeps the routine, empties its rooms and leaves chores alone', async () => {
    const { deps, s, as, rooms, create, remove, stored, kinds } = await setup()
    const r = await create(as('Sam'), {
      ...NEW,
      who: { takesTurns: true, startsWith: s.people.Wren },
      roomIds: rooms('Kitchen'),
    })
    if (!r.ok) throw new Error(r.error)
    const sink = await makeCreateItem(deps)(as('Sam'), {
      category: 'chore',
      title: 'Sink',
      kind: 'deep_clean',
      rooms: rooms('Kitchen'),
    })
    expect(sink.ok).toBe(true)
    const gone = await remove(as('Jo'), r.value.id)
    expect(gone.ok && gone.value.removedAt).toEqual(TEST_NOW)
    expect(stored().find((x) => x.id === s.rooms.Kitchen!.id)!.routineId).toBeUndefined()
    expect(kinds()).toContain('routine.removed')
    expect(sink.ok && deps.uow.state.items.get(sink.value.id)?.archivedAt).toBeUndefined()
    expect(await remove(as('Jo'), r.value.id)).toEqual({ ok: false, error: 'removed' })
    expect(await remove(as('Jo'), 'nope' as never)).toEqual({ ok: false, error: 'not_found' })
  })

  it('a chore points only at rooms in its own house', async () => {
    const { deps, as, create: _c } = await setup()
    const r = await makeCreateItem(deps)(as('Sam'), {
      category: 'chore',
      title: 'Sink',
      rooms: ['nope' as RoomId],
    })
    expect(r).toEqual({ ok: false, error: 'unknown_room' })
  })

  it('moving out re-anchors in the same transaction; a fixed person falls back to turns', async () => {
    const { deps, s, as, rooms, create, kinds } = await setup()
    const a = await create(as('Sam'), {
      ...NEW,
      who: { takesTurns: true, startsWith: s.people.Wren },
      roomIds: rooms('Kitchen'),
    })
    const b = await create(as('Sam'), {
      ...NEW,
      name: 'Garden',
      who: { takesTurns: false, fixedMember: s.people.Wren },
      roomIds: [],
    })
    if (!a.ok || !b.ok) throw new Error('create')
    const moved = await makeMoveOut(deps)(as('Wren'), { userId: s.people.Wren })
    expect(moved.ok).toBe(true)
    const members = [...deps.uow.state.members.values()].filter((m) => m.houseId === s.house.id)
    const today = localDateOf(TEST_NOW, s.house.settings.timezone)
    const turned = deps.uow.state.routines.get(a.value.id)!
    expect(routineHolder(turned, members, today)).not.toBe(s.people.Wren)
    const fixed = deps.uow.state.routines.get(b.value.id)!
    expect(fixed.fixedMember).toBeUndefined()
    expect(routineHolder(fixed, members, today)).toBeDefined()
    expect(kinds()).toContain('routine.updated')
  })

  it('the tick sends each new holder one handover, however often it runs', async () => {
    const { deps, s, as, rooms, create, setNow } = await setup()
    const r = await create(as('Sam'), {
      ...NEW,
      who: { takesTurns: true, startsWith: s.people.Wren },
      roomIds: rooms('Kitchen'),
    })
    if (!r.ok) throw new Error(r.error)
    // Walk forward a day at a time for two weeks, ticking twice a day.
    for (let day = 1; day <= 14; day++) {
      setNow(day * 86_400_000)
      await makeRunReminders(deps)()
      await makeRunReminders(deps)()
    }
    const handovers = deps.uow.state.outbox.filter((m) => m.title.startsWith('You have'))
    expect(handovers).toHaveLength(2)
    expect(new Set(handovers.map((m) => m.dedupeKey)).size).toBe(2)
    expect(handovers[0]!.title).toBe('You have the kitchen this week')
    expect(handovers[0]!.category).toBe('assigned')
  })
})
