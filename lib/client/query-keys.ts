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
  feelings: (houseId: HouseId) => ['house', houseId, 'feelings'] as const,
  runs: (houseId: HouseId) => ['house', houseId, 'runs'] as const,
  polls: (houseId: HouseId) => ['house', houseId, 'polls'] as const,
  costs: (houseId: HouseId) => ['house', houseId, 'costs'] as const,
  notificationsOff: (houseId: HouseId) => ['house', houseId, 'notifications-off'] as const,
  /** Under activity, so anything that writes to the log refreshes it. */
  weightsChange: (houseId: HouseId) => ['house', houseId, 'activity', 'weights'] as const,
  runActivity: (houseId: HouseId, runId: string) =>
    ['house', houseId, 'activity', 'run', runId] as const,
  itemActivity: (houseId: HouseId, itemId: string) =>
    ['house', houseId, 'activity', 'item', itemId] as const,
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
    case 'feelings':
      return [keys.feelings(houseId), keys.activity(houseId)]
    case 'items':
      return [keys.items(houseId)]
    case 'costs':
      return [keys.costs(houseId)]
    case 'polls':
      return [keys.polls(houseId)]
    case 'runs':
      return [keys.runs(houseId), keys.items(houseId)]
    case 'house_invites':
      return [keys.invites(houseId)]
    case 'activity_events':
      return [keys.activity(houseId)]
    default:
      return [keys.house(houseId)] // everything for the house
  }
}
