// Admin → Routines use cases (PRD §6.2, T96). Any member can create and change them. Every change
// records its event; who has a routine is never written (lib/domain/routines.ts).

import type { AppDeps } from './ports'
import { actorUser, type HouseActor } from '../domain/actor'
import type { RoomId, RoutineId, UserId } from '../domain/ids'
import type { Version } from '../domain/items'
import { err, ok, type Result } from '../domain/result'
import {
  createRoutine,
  editRoutine,
  removeRoutine,
  setRoutineRooms,
  type Resets,
  type Routine,
  type RoutineError,
  type RoutinePatch,
  type RoutineWho,
} from '../domain/routines'
import { localDateOf } from '../domain/time'

type Deps = Pick<AppDeps, 'uow' | 'clock' | 'ids'>
type RoomError = 'unknown_room'

export const makeCreateRoutine =
  ({ uow, clock, ids }: Deps) =>
  (
    actor: HouseActor,
    input: {
      name: string
      icon: string
      resets: Resets
      who: RoutineWho
      roomIds: readonly RoomId[]
    },
  ): Promise<Result<Routine, RoutineError | RoomError | 'not_found'>> =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      const house = await repos.houses.get(actor.houseId)
      if (!by || !house) return err('not_found')
      const [members, rooms, routines] = await Promise.all([
        repos.members.listByHouse(actor.houseId),
        repos.rooms.listByHouse(actor.houseId),
        repos.routines.listByHouse(actor.houseId),
      ])
      if (input.roomIds.some((id) => !rooms.some((r) => r.id === id && !r.archivedAt)))
        return err('unknown_room')
      const now = clock.now()
      const actionId = ids.newId<'action'>()
      const r = createRoutine(input, {
        id: ids.newId<'routine'>() as RoutineId,
        houseId: actor.houseId,
        by,
        now,
        today: localDateOf(now, house.settings.timezone),
        actionId,
        members,
        sortOrder: Math.max(-1, ...routines.map((x) => x.sortOrder)) + 1,
      })
      if (!r.ok) return r
      const moved = setRoutineRooms(rooms, r.value.routine.id, input.roomIds, { by, actionId })
      await repos.routines.save(r.value.routine)
      for (const room of moved.rooms) await repos.rooms.save(room)
      await repos.events.record(actor.houseId, [...r.value.events, ...moved.events], now)
      return ok(r.value.routine)
    })

/** Edits a routine and, with `roomIds`, makes those its rooms. Either alone is a change. */
export const makeEditRoutine =
  ({ uow, clock, ids }: Deps) =>
  (
    actor: HouseActor,
    input: {
      id: RoutineId
      patch: RoutinePatch & { roomIds?: readonly RoomId[] }
      version?: Version
    },
  ): Promise<Result<Routine, RoutineError | RoomError | 'not_found' | 'no_change' | 'removed'>> =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      const [routine, house] = await Promise.all([
        repos.routines.get(input.id),
        repos.houses.get(actor.houseId),
      ])
      if (!by || !house || routine?.houseId !== actor.houseId) return err('not_found')
      const [members, rooms] = await Promise.all([
        repos.members.listByHouse(actor.houseId),
        repos.rooms.listByHouse(actor.houseId),
      ])
      const { roomIds, ...patch } = input.patch
      if (roomIds?.some((id) => !rooms.some((r) => r.id === id && !r.archivedAt)))
        return err('unknown_room')
      const now = clock.now()
      const actionId = ids.newId<'action'>()
      // A form sends what it holds, so a stale copy is refused as it is for items (§7.5).
      const loaded = input.version ? { ...routine, version: input.version } : routine
      const r = editRoutine(loaded, patch, {
        by,
        today: localDateOf(now, house.settings.timezone),
        actionId,
        members,
      })
      const moved = roomIds
        ? setRoutineRooms(rooms, routine.id, roomIds, { by, actionId })
        : { rooms: [], events: [] }
      if (!r.ok && !(r.error === 'no_change' && moved.events.length > 0)) return r
      const saved = r.ok ? r.value.routine : routine
      if (r.ok) await repos.routines.save(saved)
      for (const room of moved.rooms) await repos.rooms.save(room)
      await repos.events.record(
        actor.houseId,
        [...(r.ok ? r.value.events : []), ...moved.events],
        now,
      )
      return ok(saved)
    })

/** Takes a routine away: its rooms are in no routine after this, so their chores go to Upkeep. */
export const makeRemoveRoutine =
  ({ uow, clock, ids }: Deps) =>
  (actor: HouseActor, id: RoutineId): Promise<Result<Routine, 'not_found' | 'removed'>> =>
    uow.run(actor, async (repos) => {
      const by: UserId | null = actorUser(actor)
      const routine = await repos.routines.get(id)
      if (!by || routine?.houseId !== actor.houseId) return err('not_found')
      const now = clock.now()
      const actionId = ids.newId<'action'>()
      const r = removeRoutine(routine, { by, now, actionId })
      if (!r.ok) return r
      const rooms = await repos.rooms.listByHouse(actor.houseId)
      const moved = setRoutineRooms(rooms, routine.id, [], { by, actionId })
      for (const room of moved.rooms) await repos.rooms.save(room)
      await repos.routines.save(r.value.routine)
      // An action reads as its first event: "removed Upstairs", not "took Kitchen out of Upstairs".
      await repos.events.record(actor.houseId, [...r.value.events, ...moved.events], now)
      return ok(r.value.routine)
    })
