import { describe, expect, it } from 'vitest'
import type { Room } from './house'
import { asId, type ActionId, type HouseId, type RoomId, type UserId } from './ids'
import { moveRoom, renameRoom } from './rooms'

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

describe('moveRoom', () => {
  const rooms = [
    r('Hallway', 'first', 0),
    r('Air', 'first', 1),
    r('Fire', 'first', 2),
    r('Earth', 'basement', 3),
    r('Old', 'first', 4, { archivedAt: { epochMs: 1 } }),
  ]

  it('swaps a room with its neighbor on the same floor', () => {
    const res = moveRoom(rooms, asId('Fire'), 'up')
    expect(res.ok && res.value.map((x) => [x.name, x.sortOrder])).toEqual([
      ['Fire', 1],
      ['Air', 2],
    ])
  })

  it('stops at the ends of a floor, skipping archived rooms', () => {
    expect(moveRoom(rooms, asId('Hallway'), 'up')).toEqual({ ok: false, error: 'at_edge' })
    expect(moveRoom(rooms, asId('Fire'), 'down')).toEqual({ ok: false, error: 'at_edge' })
    expect(moveRoom(rooms, asId('Earth'), 'up')).toEqual({ ok: false, error: 'at_edge' })
    expect(moveRoom(rooms, asId('Nope'), 'up')).toEqual({ ok: false, error: 'not_found' })
  })
})
