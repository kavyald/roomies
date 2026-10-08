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

// ---- grouping (House → Rooms, the item room picker) ----------------------------------------

/** The three groups rooms are shown in (FRONTEND §5.11): by what a room is, not where it is. */
export type RoomGroup = 'bedrooms' | 'bathrooms' | 'spaces'

export const ROOM_GROUPS: readonly RoomGroup[] = ['bedrooms', 'bathrooms', 'spaces']

export const roomGroup = (kind: RoomKind): RoomGroup =>
  kind === 'bedroom' ? 'bedrooms' : kind === 'bath' ? 'bathrooms' : 'spaces'

/** A group's live rooms in their saved order (sort_order, then name). */
export const roomsInGroup = (rooms: readonly Room[], group: RoomGroup): Room[] =>
  rooms
    .filter((r) => !r.archivedAt && roomGroup(r.kind) === group)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

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
 * Moves a room one place earlier or later within its group (bedrooms, bathrooms or spaces). The
 * group keeps the sort_order slots it already had, so other groups never move; if two of its
 * rooms share a slot, the group is renumbered from its lowest. Returns only the rooms whose
 * position changed.
 */
export const moveRoom = (
  rooms: readonly Room[],
  roomId: RoomId,
  direction: 'up' | 'down',
): Result<Room[], 'not_found' | 'at_edge'> => {
  const room = rooms.find((r) => r.id === roomId)
  if (!room) return err('not_found')
  const group = roomsInGroup(rooms, roomGroup(room.kind))
  const i = group.findIndex((r) => r.id === roomId)
  if (i < 0) return err('not_found') // archived
  const j = direction === 'up' ? i - 1 : i + 1
  if (j < 0 || j >= group.length) return err('at_edge')
  const order = [...group]
  ;[order[i], order[j]] = [order[j]!, order[i]!]
  const slots = group.map((r) => r.sortOrder)
  const distinct = new Set(slots).size === slots.length
  const slot = (k: number) => (distinct ? slots[k]! : slots[0]! + k)
  return ok(
    order
      .map((r, k) => ({ ...r, sortOrder: slot(k) }))
      .filter((r) => r.sortOrder !== group.find((g) => g.id === r.id)!.sortOrder),
  )
}
