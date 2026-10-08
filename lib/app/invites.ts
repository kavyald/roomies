// Invite use cases (ARCHITECTURE §5.2). Creating and revoking are admin actions under RLS.
// Checking, starting, and accepting happen before the person is a member, so they run as Roomies
// (the system actor) after checking the token themselves.

import type { AppDeps } from './ports'
import type { Actor, HouseActor } from '../domain/actor'
import { actorUser } from '../domain/actor'
import type { Element, House, Invite, Room } from '../domain/house'
import { asId, type HouseId, type RoomId, type UserId } from '../domain/ids'
import {
  acceptInvite,
  createInvite,
  isInviteProblem,
  openBedrooms,
  revokeInvite,
  validateInvite,
  type InviteProblem,
  type NewInvite,
} from '../domain/invites'
import { err, ok, type Result } from '../domain/result'
import { MS_PER_MINUTE, MS_PER_HOUR } from '../domain/time'
import { withinRate, type Attempt } from './security'

/** Roomies acting before a house is known (it looks the invite up by its token). */
const ROOMIES: Actor = {
  kind: 'system',
  houseId: asId<'house'>('00000000-0000-0000-0000-000000000000') as HouseId,
}
const roomiesIn = (houseId: HouseId): Actor => ({ kind: 'system', houseId })

/**
 * Logs a refused invite token (§5.4) and passes the result on. Only problems with the invite
 * itself are logged; a taken bedroom or an empty name is the person's own mistake.
 */
const logIfRefused = async <T, E extends string>(
  securityLog: AppDeps['securityLog'],
  r: Result<T, E>,
  at: Attempt,
): Promise<Result<T, E>> => {
  if (!r.ok && isInviteProblem(r.error)) {
    await securityLog.record({
      kind: 'invite_refused',
      reason: r.error,
      step: at.step,
      ip: at.ip,
      at: at.now,
    })
  }
  return r
}

/** Per IP: a few tries per 10 minutes is plenty for a person, and slows down guessing. */
export const INVITE_RATE = { limit: 10, windowMs: 10 * MS_PER_MINUTE }
export const SETUP_RATE = { limit: 10, windowMs: MS_PER_HOUR }

// ---- admins ------------------------------------------------------------------------------

export const makeCreateInvite =
  ({ uow, clock, ids, tokens }: Pick<AppDeps, 'uow' | 'clock' | 'ids' | 'tokens'>) =>
  (
    actor: HouseActor,
    input: NewInvite,
  ): Promise<Result<{ invite: Invite; token: string }, 'not_admin' | 'bad_limits' | 'not_found'>> =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      const house = await repos.houses.get(actor.houseId)
      if (!house || !by) return err('not_found')
      const me = await repos.members.get(house.id, by)
      if (me?.role !== 'admin' || !me.status.active) return err('not_admin')

      const [rooms, members] = await Promise.all([
        repos.rooms.listByHouse(house.id),
        repos.members.listByHouse(house.id),
      ])
      const token = tokens.newToken()
      const now = clock.now()
      const r = createInvite(input, {
        houseId: house.id,
        defaultTtlDays: house.settings.inviteTtlDays,
        openSpots: openBedrooms(rooms, members).length,
        by,
        now,
        id: ids.newId(),
        tokenHash: tokens.hash(token),
        actionId: ids.newId(),
      })
      if (!r.ok) return r
      await repos.invites.save(r.value.invite)
      await repos.events.record(house.id, r.value.events, now)
      return ok({ invite: r.value.invite, token })
    })

export const makeRevokeInvite =
  ({ uow, clock, ids }: Pick<AppDeps, 'uow' | 'clock' | 'ids'>) =>
  (
    actor: HouseActor,
    inviteId: Invite['id'],
  ): Promise<Result<Invite, 'not_found' | 'already_revoked'>> =>
    uow.run(actor, async (repos) => {
      const by = actorUser(actor)
      const inv = await repos.invites.get(inviteId) // admins only, by RLS
      if (!inv || inv.houseId !== actor.houseId || !by) return err('not_found')
      const now = clock.now()
      const r = revokeInvite(inv, by, now, ids.newId())
      if (!r.ok) return r
      await repos.invites.save(r.value.invite)
      await repos.events.record(inv.houseId, r.value.events, now)
      return ok(r.value.invite)
    })

/** The house's invites that still work, newest first (for the admin list). */
export const makeListInvites =
  ({ uow, clock }: Pick<AppDeps, 'uow' | 'clock'>) =>
  (actor: HouseActor): Promise<Invite[]> =>
    uow.run(actor, async (repos) => {
      const now = clock.now()
      return (await repos.invites.listByHouse(actor.houseId))
        .filter((i) => validateInvite(i, now).ok)
        .sort((a, b) => b.expiresAt.epochMs - a.expiresAt.epochMs)
    })

// ---- the person joining ----------------------------------------------------------------------

export type Bedroom = { id: RoomId; name: string; element?: Element; takenBy?: string }

export type InviteDetails = {
  houseId: HouseId
  houseName: string
  invitedBy: string
  bedrooms: Bedroom[]
}

const lookUp = async (
  repos: Parameters<Parameters<AppDeps['uow']['run']>[1]>[0],
  tokenHash: string,
  now: Parameters<typeof validateInvite>[1],
) => validateInvite(await repos.invites.findByTokenHash(tokenHash), now)

/** What the join page shows: whose house, who invited you, which bedrooms are free. */
export const makeInviteDetails =
  ({
    uow,
    clock,
    tokens,
    securityLog,
  }: Pick<AppDeps, 'uow' | 'clock' | 'tokens' | 'securityLog'>) =>
  async (ip: string, token: string): Promise<Result<InviteDetails, InviteProblem>> => {
    const now = clock.now()
    const details = await uow.run(
      ROOMIES,
      async (repos): Promise<Result<InviteDetails, InviteProblem>> => {
        const v = await lookUp(repos, tokens.hash(token), now)
        if (!v.ok) return v
        const inv = v.value
        const [house, rooms, members, inviter] = await Promise.all([
          repos.houses.get(inv.houseId),
          repos.rooms.listByHouse(inv.houseId),
          repos.members.listByHouse(inv.houseId),
          repos.profiles.get(inv.createdBy),
        ])
        if (!house) return err('invalid')
        const names = new Map(
          await Promise.all(
            members
              .filter((m) => m.status.active && m.roomId)
              .map(
                async (m) =>
                  [m.roomId!, (await repos.profiles.get(m.userId))?.displayName] as const,
              ),
          ),
        )
        const bedrooms = rooms
          .filter((r) => r.kind === 'bedroom' && !r.archivedAt)
          .map((r) => ({
            id: r.id,
            name: r.name,
            ...(r.element && { element: r.element }),
            ...(names.get(r.id) && { takenBy: names.get(r.id) }),
          }))
        return ok({
          houseId: house.id,
          houseName: house.name,
          invitedBy: inviter?.displayName ?? 'A roommate',
          bedrooms,
        })
      },
    )
    return logIfRefused(securityLog, details, { ip, step: 'join.view', now })
  }

/**
 * Step 1 of joining: with a valid invite, make the account (if new) and send a code.
 * Refused tokens go to the security log, never explained beyond the page's copy.
 */
export const makeStartInvite =
  ({
    uow,
    clock,
    tokens,
    auth,
    limiter,
    securityLog,
  }: Pick<AppDeps, 'uow' | 'clock' | 'tokens' | 'auth' | 'limiter' | 'securityLog'>) =>
  async (
    ip: string,
    token: string,
    email: string,
  ): Promise<Result<void, InviteProblem | 'rate_limited'>> => {
    const at = { ip, step: 'join.start' as const, now: clock.now() }
    if (!(await withinRate({ limiter, securityLog }, 'invite:start', INVITE_RATE, at))) {
      return err('rate_limited')
    }
    const v = await logIfRefused(
      securityLog,
      await uow.run(ROOMIES, (repos) => lookUp(repos, tokens.hash(token), at.now)),
      at,
    )
    if (!v.ok) return v
    await auth.createUser(email) // already_exists is fine: they may be rejoining or retrying
    await auth.sendCode(email)
    return ok(undefined)
  }

export type AcceptError =
  InviteProblem | 'rate_limited' | 'already_member' | 'room_taken' | 'empty_name'

/** The last step, signed in: join the house, with the bedroom they picked. */
export const makeAcceptInvite =
  ({
    uow,
    clock,
    ids,
    tokens,
    limiter,
    securityLog,
  }: Pick<AppDeps, 'uow' | 'clock' | 'ids' | 'tokens' | 'limiter' | 'securityLog'>) =>
  async (
    ip: string,
    userId: UserId,
    token: string,
    input: { displayName: string; roomId?: RoomId },
  ): Promise<Result<House['id'], AcceptError>> => {
    const now = clock.now()
    const at = { ip, step: 'join.accept' as const, now }
    if (!(await withinRate({ limiter, securityLog }, 'invite:accept', INVITE_RATE, at))) {
      return err('rate_limited')
    }
    const found = await uow.run(ROOMIES, (repos) => lookUp(repos, tokens.hash(token), now))
    if (!found.ok) return logIfRefused(securityLog, found, at)
    const houseId = found.value.houseId

    const joined = await uow.run(
      roomiesIn(houseId),
      async (repos): Promise<Result<HouseId, AcceptError>> => {
        // Re-read inside the write transaction, so two people can't take the last use.
        const v = await lookUp(repos, tokens.hash(token), now)
        if (!v.ok) return v
        const [rooms, members, existingMember, existingProfile] = await Promise.all([
          repos.rooms.listByHouse(houseId),
          repos.members.listByHouse(houseId),
          repos.members.get(houseId, userId),
          repos.profiles.get(userId),
        ])
        const room: Room | undefined = input.roomId
          ? rooms.find((r) => r.id === input.roomId)
          : undefined
        if (input.roomId && !room) return err('room_taken')
        const r = acceptInvite(
          v.value,
          { userId, displayName: input.displayName, ...(room && { room }) },
          {
            now,
            actionId: ids.newId(),
            existingMember,
            existingProfile,
            openBedrooms: openBedrooms(rooms, members),
          },
        )
        if (!r.ok) return r
        await repos.profiles.save(r.value.profile)
        await repos.members.save(r.value.member)
        await repos.invites.save(r.value.invite)
        await repos.events.record(houseId, r.value.events, now)
        return ok(houseId)
      },
    )
    // Someone else took the last use between the two reads: logged like any used-up link.
    return logIfRefused(securityLog, joined, at)
  }
