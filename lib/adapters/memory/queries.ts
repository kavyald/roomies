import type { ChangeFeed, HouseQueries } from '../../app/ports'
import type { Actor } from '../../domain/actor'
import { noSubjects, pageAtActionBoundary, type ActivitySubjects } from '../../domain/activity'
import type { Profile } from '../../domain/house'
import { activeCosts } from '../../domain/costs'
import type { StoredActivityRow } from '../../domain/events'
import type { HouseId } from '../../domain/ids'
import type { Cents } from '../../domain/money'
import type { RunRef } from '../../domain/runs'
import type { MemoryUnitOfWork } from './db'
import { changeForKind } from '../change-for-kind'

/** Reads as `actor`, through the same access rules as writes. */
export const memoryHouseQueries = (uow: MemoryUnitOfWork, actor: Actor): HouseQueries => ({
  house: (houseId) => uow.run(actor, (r) => r.houses.get(houseId)),
  members: (houseId) => uow.run(actor, (r) => r.members.listByHouse(houseId)),
  profiles: (houseId) =>
    uow.run(actor, async (r) => {
      const members = await r.members.listByHouse(houseId)
      const profiles = await Promise.all(members.map((m) => r.profiles.get(m.userId)))
      return profiles.filter((p): p is Profile => p !== undefined)
    }),
  rooms: (houseId) => uow.run(actor, (r) => r.rooms.listByHouse(houseId)),
  contacts: (houseId) => uow.run(actor, (r) => r.contacts.listByHouse(houseId)),
  invites: (houseId) => uow.run(actor, (r) => r.invites.listByHouse(houseId)),
  items: (houseId) => uow.run(actor, (r) => r.items.listByHouse(houseId)),
  feelings: async (houseId) => {
    const visible = await uow.run(actor, (r) => r.houses.get(houseId))
    if (!visible) return []
    return [...uow.state.feelings.values()]
      .filter((f) => f.houseId === houseId)
      .map((f) => f.feeling)
  },
  itemActivity: async (houseId, itemId) => {
    const visible = await uow.run(actor, (r) => r.houses.get(houseId))
    if (!visible) return []
    return uow.state.activity
      .filter((a) => a.houseId === houseId && a.itemId === itemId)
      .sort((a, b) => b.id - a.id)
  },
  runs: (houseId) => uow.run(actor, (r) => r.runs.listByHouse(houseId)),
  polls: (houseId) => uow.run(actor, (r) => r.polls.listByHouse(houseId)),
  costs: (houseId) => uow.run(actor, async (r) => activeCosts(await r.costs.listByHouse(houseId))),
  notificationsOff: (userId) =>
    uow.run(actor, async (r) => [...((await r.notifications.offFor([userId])).get(userId) ?? [])]),
  runActivity: async (houseId, runId) => {
    const visible = await uow.run(actor, (r) => r.houses.get(houseId))
    if (!visible) return []
    return uow.state.activity
      .filter((a) => a.houseId === houseId && (a.runId === runId || a.toRunId === runId))
      .sort((a, b) => a.id - b.id)
  },
  latestActivity: async (houseId, kind) => {
    const visible = await uow.run(actor, (r) => r.houses.get(houseId))
    if (!visible) return undefined
    return uow.state.activity
      .filter((a) => a.houseId === houseId && a.kind === kind)
      .reduce<StoredActivityRow | undefined>(
        (latest, a) => (!latest || a.id > latest.id ? a : latest),
        undefined,
      )
  },
  activity: async (houseId, { before, limit }) => {
    // Reads go through the same rule as RLS: members of the house only.
    const visible = await uow.run(actor, (r) => r.houses.get(houseId))
    if (!visible) return { rows: [], before: null, subjects: noSubjects }
    const rows = uow.state.activity
      .filter((a) => a.houseId === houseId && (before === undefined || a.id < before))
      .sort((a, b) => b.id - a.id)
    const page = pageAtActionBoundary(rows, limit)
    return { ...page, subjects: subjectsOf(uow.state, houseId, page.rows) }
  },
})

/**
 * A ChangeFeed over the memory UnitOfWork: activity committed in the house, seen by `actor` only
 * while they can read the house (the same rule RLS applies to Realtime).
 */
export const memoryChangeFeed = (uow: MemoryUnitOfWork, actor: Actor): ChangeFeed => ({
  subscribe: (houseId, onChange) =>
    uow.onCommit((rows) => {
      if (!rows.some((r) => r.houseId === houseId)) return
      void uow
        .run(actor, (r) => r.houses.get(houseId))
        .then((visible) => {
          if (!visible) return
          for (const row of rows) if (row.houseId === houseId) onChange(changeForKind(row.kind))
        })
    }),
})

/** What a page's rows point at, the way the Supabase query embeds it (same house only). */
const subjectsOf = (
  state: MemoryUnitOfWork['state'],
  houseId: HouseId,
  rows: readonly StoredActivityRow[],
): ActivitySubjects => {
  const items: Record<string, ActivitySubjects['items'][string]> = {}
  const runs: Record<string, RunRef> = {}
  const polls: Record<string, string> = {}
  const options: Record<string, string> = {}
  const costs: Record<string, Cents> = {}
  for (const r of rows) {
    const item = r.itemId && state.items.get(r.itemId)
    if (item && item.houseId === houseId)
      items[item.id] = { title: item.title, category: item.category }
    for (const id of [r.runId, r.toRunId]) {
      const run = id && state.runs.get(id)
      if (run && run.houseId === houseId)
        runs[run.id] = {
          kind: run.kind,
          runner: run.runner,
          ...(run.title && { title: run.title }),
          ...(run.kind !== 'batch' && { contactId: run.contactId }),
        }
    }
    const poll = r.pollId && state.polls.get(r.pollId)
    if (poll && poll.houseId === houseId) {
      polls[poll.id] = poll.question
      const option = r.optionId && poll.options.find((o) => o.id === r.optionId)
      if (option) options[option.id] = option.label
    }
    const cost = r.costId && state.costs.find((c) => c.id === r.costId && c.houseId === houseId)
    if (cost) costs[cost.id] = cost.amount
  }
  return { items, runs, polls, options, costs }
}
