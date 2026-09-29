import type { HouseId } from '../domain/ids'

/** TanStack Query keys, one family per house so a change can invalidate just its house. */
export const keys = {
  house: (houseId: HouseId) => ['house', houseId] as const,
  members: (houseId: HouseId) => ['house', houseId, 'members'] as const,
  profiles: (houseId: HouseId) => ['house', houseId, 'profiles'] as const,
  rooms: (houseId: HouseId) => ['house', houseId, 'rooms'] as const,
  contacts: (houseId: HouseId) => ['house', houseId, 'contacts'] as const,
  activity: (houseId: HouseId) => ['house', houseId, 'activity'] as const,
  invites: (houseId: HouseId) => ['house', houseId, 'invites'] as const,
  items: (houseId: HouseId) => ['house', houseId, 'items'] as const,
}

/** Which queries a changed table affects (used by the ChangeFeed, T26). */
export const keysForTable = (houseId: HouseId, table: string): readonly (readonly unknown[])[] => {
  switch (table) {
    case 'houses':
      return [keys.house(houseId)]
    case 'house_members':
      return [keys.members(houseId), keys.profiles(houseId)]
    case 'profiles':
      return [keys.profiles(houseId)]
    case 'rooms':
      return [keys.rooms(houseId)]
    case 'contacts':
      return [keys.contacts(houseId)]
    case 'items':
      return [keys.items(houseId)]
    case 'house_invites':
      return [keys.invites(houseId)]
    case 'activity_events':
      return [keys.activity(houseId)]
    default:
      return [keys.house(houseId)] // everything for the house
  }
}
