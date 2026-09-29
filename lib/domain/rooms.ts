import type { Element, Floor, RoomKind } from './house'

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
