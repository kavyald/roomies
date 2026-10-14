// HouseQueries over the Supabase client (ARCHITECTURE §4). Runs in the browser with the signed-in
// user's session, so RLS decides what comes back. Rows map to domain types with the same mappers
// as the Postgres adapter (timestamps arrive as ISO strings here).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NotificationCategory } from '../../domain/notifications'
import type { ActivityPage, HouseQueries } from '../../app/ports'
import type { ActivitySubjects } from '../../domain/activity'
import { asId } from '../../domain/ids'
import type { Category } from '../../domain/items'
import type { Cents } from '../../domain/money'
import type { RunRef } from '../../domain/runs'
import {
  activityToDomain,
  contactToDomain,
  costToDomain,
  feelingToDomain,
  houseToDomain,
  inviteToDomain,
  itemToDomain,
  memberToDomain,
  profileToDomain,
  pollToDomain,
  roomToDomain,
  runToDomain,
} from '../postgres/mappers'

type Mapper<T> = (row: never) => T

// An activity row with what it points at. Two foreign keys lead to runs, so those name theirs.
const RUN_REF = 'kind, title, runner_id, contact_id'
const WITH_SUBJECTS = `*, item:items(title, category), run:runs!activity_events_run_id_fkey(${RUN_REF}), to_run:runs!activity_events_to_run_id_fkey(${RUN_REF}), poll:polls(question), option:poll_options(label), cost:costs(amount_cents)`

type RunRow = {
  kind: RunRef['kind']
  title: string | null
  runner_id: string
  contact_id: string | null
}
type RowWithSubjects = Record<string, unknown> & {
  id: number | string
  item_id: string | null
  run_id: string | null
  to_run_id: string | null
  poll_id: string | null
  option_id: string | null
  cost_id: string | null
  action_id: string
  item: { title: string; category: Category } | null
  run: RunRow | null
  to_run: RunRow | null
  poll: { question: string } | null
  option: { label: string } | null
  cost: { amount_cents: number } | null
}

const raw = async (
  q: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<RowWithSubjects[]> => {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as RowWithSubjects[]
}

const runRef = (r: RunRow): RunRef => ({
  kind: r.kind,
  runner: asId<'user'>(r.runner_id),
  ...(r.title && { title: r.title }),
  ...(r.contact_id && { contactId: asId<'contact'>(r.contact_id) }),
})

const withSubjects = (page: readonly RowWithSubjects[], before: number | null): ActivityPage => {
  const items: Record<string, ActivitySubjects['items'][string]> = {}
  const runs: Record<string, RunRef> = {}
  const polls: Record<string, string> = {}
  const options: Record<string, string> = {}
  const costs: Record<string, Cents> = {}
  for (const r of page) {
    if (r.item_id && r.item) items[r.item_id] = { title: r.item.title, category: r.item.category }
    if (r.run_id && r.run) runs[r.run_id] = runRef(r.run)
    if (r.to_run_id && r.to_run) runs[r.to_run_id] = runRef(r.to_run)
    if (r.poll_id && r.poll) polls[r.poll_id] = r.poll.question
    if (r.option_id && r.option) options[r.option_id] = r.option.label
    if (r.cost_id && r.cost) costs[r.cost_id] = r.cost.amount_cents as Cents
  }
  return {
    rows: page.map((r) => activityToDomain(r as never)),
    before,
    subjects: { items, runs, polls, options, costs },
  }
}

const rows = async <T>(
  q: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  map: Mapper<T>,
): Promise<T[]> => {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => map(r as never))
}

export const supabaseHouseQueries = (sb: SupabaseClient): HouseQueries => {
  // The house time zone, to read item dates as local dates.
  const zones = new Map<string, Promise<string>>()
  const tzOf = (houseId: string) => {
    let z = zones.get(houseId)
    if (!z) {
      z = Promise.resolve(
        sb.from('houses').select('settings').eq('id', houseId).maybeSingle(),
      ).then(({ data }) => (data?.settings as { timezone?: string } | undefined)?.timezone ?? 'UTC')
      zones.set(houseId, z)
    }
    return z
  }
  return {
    house: async (houseId) => {
      const { data, error } = await sb.from('houses').select('*').eq('id', houseId).maybeSingle()
      if (error) throw new Error(error.message)
      return data ? houseToDomain(data) : undefined
    },
    members: (houseId) =>
      rows(
        sb
          .from('house_members')
          .select('*')
          .eq('house_id', houseId)
          .order('joined_at')
          .order('user_id'),
        memberToDomain,
      ),
    profiles: async (houseId) => {
      const members = await rows(
        sb.from('house_members').select('user_id').eq('house_id', houseId),
        (r: { user_id: string }) => r.user_id,
      )
      if (members.length === 0) return []
      return rows(
        sb.from('profiles').select('*').in('id', members).order('display_name'),
        profileToDomain,
      )
    },
    rooms: (houseId) =>
      rows(
        sb.from('rooms').select('*').eq('house_id', houseId).order('sort_order').order('name'),
        roomToDomain,
      ),
    contacts: (houseId) =>
      rows(sb.from('contacts').select('*').eq('house_id', houseId), contactToDomain).then((cs) =>
        cs.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
      ),
    items: async (houseId) => {
      const tz = await tzOf(houseId)
      return rows(sb.from('items').select('*').eq('house_id', houseId).order('created_at'), (r) =>
        itemToDomain(r, tz),
      )
    },
    notificationsOff: (userId) =>
      rows(
        sb.from('notification_prefs').select('category').eq('user_id', userId).eq('enabled', false),
        (r: { category: NotificationCategory }) => r.category,
      ),
    costs: (houseId) =>
      rows(
        sb
          .from('costs')
          .select('*')
          .eq('house_id', houseId)
          .is('removed_at', null)
          .order('created_at'),
        costToDomain,
      ),
    polls: async (houseId) => {
      const byHouse = (table: string) =>
        sb.from(table).select('*').eq('house_id', houseId) as unknown as PromiseLike<{
          data: never[] | null
          error: { message: string } | null
        }>
      const [polls, options, votes] = await Promise.all([
        rows(byHouse('polls'), (r) => r),
        rows(byHouse('poll_options'), (r) => r),
        rows(byHouse('poll_votes'), (r) => r),
      ])
      return polls
        .sort((a: { created_at: string }, b: { created_at: string }) =>
          a.created_at.localeCompare(b.created_at),
        )
        .map((p) => pollToDomain(p, options, votes))
    },
    runs: async (houseId) => {
      const tz = await tzOf(houseId)
      return rows(sb.from('runs').select('*').eq('house_id', houseId).order('created_at'), (r) =>
        runToDomain(r, tz),
      )
    },
    runActivity: (houseId, runId) =>
      rows(
        sb
          .from('activity_events')
          .select('*')
          .eq('house_id', houseId)
          .or(`run_id.eq.${runId},to_run_id.eq.${runId}`)
          .order('id', { ascending: true }),
        activityToDomain,
      ),
    feelings: (houseId) =>
      rows(sb.from('feelings').select('*').eq('house_id', houseId), feelingToDomain),
    itemActivity: (houseId, itemId) =>
      rows(
        sb
          .from('activity_events')
          .select('*')
          .eq('house_id', houseId)
          .eq('item_id', itemId)
          .order('id', { ascending: false }),
        activityToDomain,
      ),
    invites: (houseId) =>
      rows(
        sb
          .from('house_invites')
          .select('*')
          .eq('house_id', houseId)
          .order('expires_at', { ascending: false }),
        inviteToDomain,
      ),
    latestActivity: async (houseId, kind) => {
      const [row] = await rows(
        sb
          .from('activity_events')
          .select('*')
          .eq('house_id', houseId)
          .eq('kind', kind)
          .order('id', { ascending: false })
          .limit(1),
        activityToDomain,
      )
      return row
    },
    activity: async (houseId, { before, limit }) => {
      // The names of what the rows point at come embedded in the same request (T40). RLS applies
      // to embedded rows too, so a line can only ever name something in this house.
      let q = sb.from('activity_events').select(WITH_SUBJECTS).eq('house_id', houseId)
      if (before !== undefined) q = q.lt('id', before)
      const page = await raw(q.order('id', { ascending: false }).limit(limit))
      if (page.length < limit) return withSubjects(page, null)
      // Finish the last action, so a bulk action never spans two pages.
      const last = page.at(-1)!
      const rest = await raw(
        sb
          .from('activity_events')
          .select(WITH_SUBJECTS)
          .eq('house_id', houseId)
          .eq('action_id', last.action_id)
          .lt('id', last.id)
          .order('id', { ascending: false }),
      )
      const all = [...page, ...rest]
      return withSubjects(all, Number(all.at(-1)!.id))
    },
  }
}
