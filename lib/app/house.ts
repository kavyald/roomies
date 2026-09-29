// House tab use cases: people and rooms (PRD §10, FRONTEND §5.11).

import type { AppDeps } from './ports'
import { actorUser, type HouseActor } from '../domain/actor'
import type { Member, Role, Room } from '../domain/house'
import type { RoomId, UserId } from '../domain/ids'
import { anonymizeProfile, moveOut, setRole } from '../domain/members'
import { err, ok, type Result } from '../domain/result'
import { moveRoom, renameRoom } from '../domain/rooms'

/** "I moved out" (target = me) or an admin removing someone. RLS lets only those two through. */
export const makeMoveOut =
  ({ uow, clock, ids }: Pick<AppDeps, 'uow' | 'clock' | 'ids'>) =>
  (
    actor: HouseActor,
    input: { userId: UserId; note?: string },
  ): Promise<Result<Member, 'not_found' | 'not_allowed' | 'already_moved_out' | 'last_admin'>> =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      const members = await repos.members.listByHouse(actor.houseId)
      const target = members.find((m) => m.userId === input.userId)
      if (!target || !by) return err('not_found')
      const now = clock.now()
      const r = moveOut(target, members, by, now, ids.newId(), input.note)
      if (!r.ok) return r
      // Record first: once someone has moved out, they can't write to the house's log.
      await repos.events.record(actor.houseId, r.value.events, now)
      await repos.members.save(r.value.member)
      return ok(r.value.member)
    })

export const makeSetRole =
  ({ uow, clock, ids }: Pick<AppDeps, 'uow' | 'clock' | 'ids'>) =>
  (
    actor: HouseActor,
    input: { userId: UserId; role: Role },
  ): Promise<
    Result<Member, 'not_found' | 'not_allowed' | 'no_change' | 'last_admin' | 'not_active'>
  > =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      const members = await repos.members.listByHouse(actor.houseId)
      const target = members.find((m) => m.userId === input.userId)
      if (!target || !by) return err('not_found')
      const r = setRole(target, input.role, members, by, ids.newId())
      if (!r.ok) return r
      await repos.members.save(r.value.member)
      await repos.events.record(actor.houseId, r.value.events, clock.now())
      return ok(r.value.member)
    })

export const makeRenameRoom =
  ({ uow, clock, ids }: Pick<AppDeps, 'uow' | 'clock' | 'ids'>) =>
  (
    actor: HouseActor,
    input: { roomId: RoomId; name: string },
  ): Promise<Result<Room, 'not_found' | 'empty_name' | 'no_change'>> =>
    uow.run(actor, async (repos) => {
      const room = await repos.rooms.get(input.roomId)
      const by = actorUser(actor)
      if (!room || room.houseId !== actor.houseId || !by) return err('not_found')
      const r = renameRoom(room, input.name, by, ids.newId())
      if (!r.ok) return r
      await repos.rooms.save(r.value.room)
      await repos.events.record(room.houseId, r.value.events, clock.now())
      return ok(r.value.room)
    })

/** Reordering is housekeeping: it isn't recorded in the activity log. */
export const makeMoveRoom =
  ({ uow }: Pick<AppDeps, 'uow'>) =>
  (
    actor: HouseActor,
    input: { roomId: RoomId; direction: 'up' | 'down' },
  ): Promise<Result<Room[], 'not_found' | 'at_edge'>> =>
    uow.run(actor, async (repos) => {
      const rooms = await repos.rooms.listByHouse(actor.houseId)
      const r = moveRoom(rooms, input.roomId, input.direction)
      if (!r.ok) return r
      for (const room of r.value) await repos.rooms.save(room)
      return r
    })

/**
 * Delete my account (PRD §10): I move out, my profile keeps only "Former roommate", and my
 * sign-in (email) is deleted. Past items and activity still point at the anonymous profile.
 */
export const makeDeleteAccount =
  ({ uow, clock, ids, auth }: Pick<AppDeps, 'uow' | 'clock' | 'ids' | 'auth'>) =>
  async (actor: HouseActor): Promise<Result<void, 'last_admin' | 'not_found'>> => {
    const me = actorUser(actor)
    if (!me) return err('not_found')
    const r = await uow.run(actor, async (repos) => {
      const members = await repos.members.listByHouse(actor.houseId)
      const mine = members.find((m) => m.userId === me)
      const profile = await repos.profiles.get(me)
      if (!mine || !profile) return err('not_found' as const)
      const now = clock.now()
      if (mine.status.active) {
        const out = moveOut(mine, members, me, now, ids.newId(), 'Deleted their account')
        if (!out.ok)
          return out.error === 'last_admin' ? err('last_admin' as const) : err('not_found' as const)
        await repos.events.record(actor.houseId, out.value.events, now) // before leaving
        await repos.members.save(out.value.member)
      }
      await repos.profiles.save(anonymizeProfile(profile))
      return ok(undefined)
    })
    if (!r.ok) return r
    await auth.deleteUser(me)
    return ok(undefined)
  }
