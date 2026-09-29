import type { Change, ChangeFeed, HouseQueries } from '../../app/ports'
import type { Actor } from '../../domain/actor'
import { pageAtActionBoundary } from '../../domain/activity'
import type { Profile } from '../../domain/house'
import type { HouseId } from '../../domain/ids'
import type { MemoryUnitOfWork } from './db'

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
  activity: async (houseId, { before, limit }) => {
    // Reads go through the same rule as RLS: members of the house only.
    const visible = await uow.run(actor, (r) => r.houses.get(houseId))
    if (!visible) return { rows: [], before: null }
    const rows = uow.state.activity
      .filter((a) => a.houseId === houseId && (before === undefined || a.id < before))
      .sort((a, b) => b.id - a.id)
    return pageAtActionBoundary(rows, limit)
  },
})

export type ManualChangeFeed = ChangeFeed & { emit(houseId: HouseId, change: Change): void }

/** A ChangeFeed that fires only when a test calls `emit`. */
export const manualChangeFeed = (): ManualChangeFeed => {
  const listeners = new Map<HouseId, Set<(c: Change) => void>>()
  return {
    subscribe: (houseId, onChange) => {
      const set = listeners.get(houseId) ?? new Set()
      set.add(onChange)
      listeners.set(houseId, set)
      return () => void set.delete(onChange)
    },
    emit: (houseId, change) => listeners.get(houseId)?.forEach((f) => f(change)),
  }
}
