// Kysely table types for the columns the app reads and writes, kept by hand next to the
// migrations. The UnitOfWork contract suite round-trips every column, so a mismatch fails it.

import type { ColumnType, Generated } from 'kysely'

type Timestamp = ColumnType<Date, Date | string, Date | string>
type Json<T> = ColumnType<T, T | string, T | string>

export type ProfilesTable = {
  id: string
  display_name: string
  theme: 'auto' | 'light' | 'dark'
  timezone: string | null
  quiet_start: string | null
  quiet_end: string | null
  created_at: Timestamp
}

export type HouseSettingsJson = {
  timezone: string
  feeling_weights: Record<string, number>
  invite_ttl_days: number
}

export type HousesTable = {
  id: string
  name: string
  address: string | null
  unit: string | null
  created_by: string
  created_at: Timestamp
  settings: Json<HouseSettingsJson>
}

export type RoomsTable = {
  id: string
  house_id: string
  name: string
  floor: 'first' | 'basement' | 'outside'
  kind: 'bedroom' | 'bath' | 'common' | 'entry' | 'utility' | 'outdoor'
  element: 'air' | 'fire' | 'water' | 'earth' | null
  sort_order: number
  archived_at: Timestamp | null
}

export type HouseMembersTable = {
  house_id: string
  user_id: string
  role: 'admin' | 'member'
  status: 'active' | 'moved_out'
  room_id: string | null
  joined_at: Timestamp
  left_at: Timestamp | null
}

export type HouseInvitesTable = {
  id: string
  house_id: string
  token_hash: string
  created_by: string
  created_at: Generated<Timestamp>
  expires_at: Timestamp
  max_uses: number
  uses: number
  revoked_at: Timestamp | null
}

export type ContactsTable = {
  id: string
  house_id: string
  name: string
  phone: string | null
  note: string | null
  created_at: Generated<Timestamp>
  archived_at: Timestamp | null
}

export type ItemsTable = {
  id: string
  house_id: string
  category: 'need' | 'chore' | 'task'
  title: string
  note: string | null
  room_id: string | null
  assignee_id: string | null
  when_at: Timestamp | null
  when_has_time: boolean
  priority: 'low' | 'normal' | 'high' | 'urgent'
  repeat_days: number | null
  last_done_at: Timestamp | null
  last_done_by: string | null
  contact_id: string | null
  done_at: Timestamp | null
  done_by: string | null
  run_id: string | null
  run_kind: 'batch' | 'request' | 'visit' | null
  created_by: string
  created_at: Timestamp
  updated_at: Generated<Timestamp>
  archived_at: Timestamp | null
}

export type RunsTable = {
  id: string
  house_id: string
  kind: 'batch' | 'request' | 'visit'
  title: string | null
  runner_id: string
  contact_id: string | null
  when_at: Timestamp | null
  when_has_time: boolean
  status: 'open' | 'finished' | 'gathering' | 'sent' | 'closed'
  sent_at: Timestamp | null
  sent_via: 'text' | 'email' | 'call' | 'portal' | 'in_person' | null
  finished_at: Timestamp | null
  created_by: string
  created_at: Timestamp
  updated_at: Generated<Timestamp>
}

export type PollsTable = {
  id: string
  house_id: string
  question: string
  item_id: string | null
  closes_at: Timestamp | null
  closed_at: Timestamp | null
  created_by: string
  created_at: Timestamp
  updated_at: Generated<Timestamp>
}

export type PollOptionsTable = {
  id: string
  poll_id: string
  house_id: string
  label: string
  note: string | null
  added_by: string
  added_at: Timestamp
  sort_order: number
}

export type PollVotesTable = {
  poll_id: string
  user_id: string
  house_id: string
  option_id: string
  voted_at: Timestamp
}

export type FeelingsTable = {
  item_id: string
  user_id: string
  house_id: string
  kind: 'anxious' | 'frustrated' | 'confused' | 'fine' | 'meh' | 'thanks'
  note: string | null
  updated_at: Timestamp
}

export type ActivityEventsTable = {
  id: Generated<ColumnType<string, never, never>> // bigserial comes back as a string
  house_id: string
  at: Timestamp
  actor_id: string | null
  action_id: string
  kind: string
  item_id: string | null
  run_id: string | null
  to_run_id: string | null
  poll_id: string | null
  option_id: string | null
  cost_id: string | null
  contact_id: string | null
  member_id: string | null
  room_id: string | null
  note: string | null
  changes: Json<unknown> | null
  payload: Json<Record<string, unknown>>
}

export type NotificationsOutboxTable = {
  id: Generated<ColumnType<string, never, never>>
  user_id: string
  house_id: string
  category: string
  title: string
  body: string
  url: string
  created_at: Generated<Timestamp>
  send_after: Generated<Timestamp>
  sent_at: Timestamp | null
  error: string | null
}

export type DB = {
  profiles: ProfilesTable
  houses: HousesTable
  rooms: RoomsTable
  house_members: HouseMembersTable
  house_invites: HouseInvitesTable
  contacts: ContactsTable
  items: ItemsTable
  feelings: FeelingsTable
  runs: RunsTable
  polls: PollsTable
  poll_options: PollOptionsTable
  poll_votes: PollVotesTable
  activity_events: ActivityEventsTable
  notifications_outbox: NotificationsOutboxTable
}
