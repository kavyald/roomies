import type { DomainEvent } from './events'
import type { Element, Floor, Room, RoomKind } from './house'
import type { ActionId, RoomId, UserId } from './ids'
import { err, ok, type Result } from './result'

export type RoomSeed = {
  readonly name: string
  readonly floor: Floor
  readonly kind: RoomKind
  readonly element?: Element
}

/** The apartment's real rooms, in walking order (FRONTEND §4.1). Seeded at setup (T15). */
export const APARTMENT_ROOMS: readonly RoomSeed[] = [
  { name: 'Front door', floor: 'first', kind: 'entry' },
  { name: 'Hallway', floor: 'first', kind: 'common' },
  { name: 'Air', floor: 'first', kind: 'bedroom', element: 'air' },
  { name: 'Fire', floor: 'first', kind: 'bedroom', element: 'fire' },
  { name: 'Water', floor: 'first', kind: 'bedroom', element: 'water' },
  { name: 'Bathroom 1', floor: 'first', kind: 'bath' },
  { name: 'Bathroom 2', floor: 'first', kind: 'bath' },
  { name: 'Kitchen', floor: 'first', kind: 'common' },
  { name: 'Living room', floor: 'first', kind: 'common' },
  { name: 'Stairs', floor: 'first', kind: 'common' },
  { name: 'Downstairs living room', floor: 'basement', kind: 'common' },
  { name: 'Bathroom 3', floor: 'basement', kind: 'bath' },
  { name: 'Laundry', floor: 'basement', kind: 'utility' },
  { name: 'Craft room', floor: 'basement', kind: 'common' },
  { name: 'Earth', floor: 'basement', kind: 'bedroom', element: 'earth' },
  { name: 'Fitness space', floor: 'basement', kind: 'common' },
  { name: 'Garden', floor: 'outside', kind: 'outdoor' },
]

// ---- editing rooms (House → Rooms) ---------------------------------------------------------

export const renameRoom = (
  room: Room,
  name: string,
  by: UserId,
  actionId: ActionId,
): Result<{ room: Room; events: DomainEvent[] }, 'empty_name' | 'no_change'> => {
  const next = name.trim()
  if (!next) return err('empty_name')
  if (next === room.name) return err('no_change')
  return ok({
    room: { ...room, name: next },
    events: [
      { kind: 'room.renamed', roomId: room.id, changes: { name: [room.name, next] }, actionId, by },
    ],
  })
}

/**
 * Moves a room one place up or down among the rooms on its floor, renumbering that floor so the
 * order is stable. Returns only the rooms whose position changed.
 */
export const moveRoom = (
  rooms: readonly Room[],
  roomId: RoomId,
  direction: 'up' | 'down',
): Result<Room[], 'not_found' | 'at_edge'> => {
  const room = rooms.find((r) => r.id === roomId)
  if (!room) return err('not_found')
  const floor = rooms
    .filter((r) => r.floor === room.floor && !r.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const i = floor.findIndex((r) => r.id === roomId)
  const j = direction === 'up' ? i - 1 : i + 1
  if (j < 0 || j >= floor.length) return err('at_edge')
  const order = [...floor]
  ;[order[i], order[j]] = [order[j]!, order[i]!]
  const base = Math.min(...floor.map((r) => r.sortOrder))
  return ok(
    order
      .map((r, k) => ({ ...r, sortOrder: base + k }))
      .filter((r) => r.sortOrder !== floor.find((f) => f.id === r.id)!.sortOrder),
  )
}
