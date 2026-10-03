import { describe, expect, it } from 'vitest'
import type { Room } from './house'
import { asId, type ActionId, type HouseId, type RoomId, type UserId } from './ids'
import { moveRoom, renameRoom, roomGroup, roomsInGroup } from './rooms'

const h = asId<'house'>('h') as HouseId
const r = (name: string, floor: Room['floor'], sortOrder: number, o: Partial<Room> = {}): Room => ({
  id: asId<'room'>(name) as RoomId,
  houseId: h,
  name,
  floor,
  kind: 'common',
  sortOrder,
  ...o,
})
const by = asId<'user'>('u') as UserId
const a = asId<'action'>('a') as ActionId

describe('renameRoom', () => {
  it('renames and records the old name', () => {
    const res = renameRoom(r('Galley', 'first', 0), ' Kitchen ', by, a)
    expect(res.ok && res.value.room.name).toBe('Kitchen')
    expect(res.ok && res.value.events[0]).toMatchObject({
      kind: 'room.renamed',
      changes: { name: ['Galley', 'Kitchen'] },
    })
    expect(renameRoom(r('Kitchen', 'first', 0), 'Kitchen', by, a)).toEqual({
      ok: false,
      error: 'no_change',
    })
    expect(renameRoom(r('Kitchen', 'first', 0), '  ', by, a)).toEqual({
      ok: false,
      error: 'empty_name',
    })
  })
})

describe('room groups', () => {
  it('puts bedrooms, bathrooms and everything else in their own group', () => {
    expect(roomGroup('bedroom')).toBe('bedrooms')
    expect(roomGroup('bath')).toBe('bathrooms')
    for (const k of ['common', 'entry', 'utility', 'outdoor'] as const)
      expect(roomGroup(k)).toBe('spaces')
  })

  it('lists a group in saved order, ties by name, without archived rooms', () => {
    const rooms = [
      r('Kitchen', 'first', 2),
      r('Air', 'first', 1, { kind: 'bedroom' }),
      r('Hallway', 'first', 0),
      r('Garden', 'outside', 2, { kind: 'outdoor' }),
      r('Old', 'first', 3, { archivedAt: { epochMs: 1 } }),
    ]
    expect(roomsInGroup(rooms, 'spaces').map((x) => x.name)).toEqual([
      'Hallway',
      'Garden',
      'Kitchen',
    ])
    expect(roomsInGroup(rooms, 'bathrooms')).toEqual([])
  })
})

describe('moveRoom', () => {
  const bed = { kind: 'bedroom' } as const
  const rooms = [
    r('Hallway', 'first', 0),
    r('Air', 'first', 1, bed),
    r('Bathroom 1', 'first', 2, { kind: 'bath' }),
    r('Fire', 'first', 3, bed),
    r('Earth', 'basement', 4, bed),
    r('Laundry', 'basement', 5, { kind: 'utility' }),
    r('Old', 'first', 6, { archivedAt: { epochMs: 1 } }),
  ]

  it('swaps a room with its neighbor in its group, across floors, keeping the slots', () => {
    const res = moveRoom(rooms, asId('Earth'), 'up')
    expect(res.ok && res.value.map((x) => [x.name, x.sortOrder])).toEqual([
      ['Earth', 3],
      ['Fire', 4],
    ])
    const spaces = moveRoom(rooms, asId('Laundry'), 'up')
    expect(spaces.ok && spaces.value.map((x) => [x.name, x.sortOrder])).toEqual([
      ['Laundry', 0],
      ['Hallway', 5],
    ])
  })

  it('renumbers a group whose rooms share a slot', () => {
    const tied = [r('A', 'first', 3, bed), r('B', 'first', 3, bed)]
    const res = moveRoom(tied, asId('B'), 'up')
    expect(res.ok && res.value.map((x) => [x.name, x.sortOrder])).toEqual([['A', 4]])
  })

  it('stops at the ends of a group, skipping archived rooms', () => {
    expect(moveRoom(rooms, asId('Air'), 'up')).toEqual({ ok: false, error: 'at_edge' })
    expect(moveRoom(rooms, asId('Earth'), 'down')).toEqual({ ok: false, error: 'at_edge' })
    expect(moveRoom(rooms, asId('Bathroom 1'), 'down')).toEqual({ ok: false, error: 'at_edge' })
    expect(moveRoom(rooms, asId('Laundry'), 'down')).toEqual({ ok: false, error: 'at_edge' })
    expect(moveRoom(rooms, asId('Old'), 'up')).toEqual({ ok: false, error: 'not_found' })
    expect(moveRoom(rooms, asId('Nope'), 'up')).toEqual({ ok: false, error: 'not_found' })
  })
})
