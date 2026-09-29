import type { Change, ChangeFeed, HouseQueries } from '../../app/ports'
import type { Actor } from '../../domain/actor'
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
