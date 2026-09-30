// Which table an activity kind changed, so a ChangeFeed can say what to refresh (T26).
import type { Change } from '../app/ports'

const TABLE_BY_PREFIX: Record<string, string> = {
  item: 'items',
  chore: 'items',
  feeling: 'feelings',
  member: 'house_members',
  room: 'rooms',
  contact: 'contacts',
  invite: 'house_invites',
  house: 'houses',
  settings: 'houses',
  run: 'runs',
  poll: 'polls',
  request: 'runs',
}

/** "item.created" → items. Kinds from later milestones (polls, runs, costs) refresh everything. */
export const changeForKind = (kind: string): Change => ({
  table: TABLE_BY_PREFIX[kind.split('.')[0]!] ?? 'unknown',
})
