// Invites (PRD §10, ARCHITECTURE §5.2): links that let a person join the house. The token itself
// is never stored; callers pass its hash. Pure: time and ids are passed in.

import type { DomainEvent } from './events'
import type { Invite, Member, Profile, Room } from './house'
import type { ActionId, HouseId, InviteId, UserId } from './ids'
import { err, ok, type Result } from './result'
import { isBefore, MS_PER_DAY, plusMs, toIso, type Instant } from './time'

export type InviteProblem = 'invalid' | 'expired' | 'revoked' | 'used_up'

/** Whether an invite still lets someone in. `undefined` means no invite matched the token. */
export const validateInvite = (
  inv: Invite | undefined,
  now: Instant,
): Result<Invite, InviteProblem> => {
  if (!inv) return err('invalid')
  if (inv.revokedAt) return err('revoked')
  if (!isBefore(now, inv.expiresAt)) return err('expired')
  if (inv.uses >= inv.maxUses) return err('used_up')
  return ok(inv)
}

/** Bedrooms (element rooms) nobody active lives in. */
export const openBedrooms = (rooms: readonly Room[], members: readonly Member[]): Room[] => {
  const taken = new Set(members.filter((m) => m.status.active && m.roomId).map((m) => m.roomId))
  return rooms.filter((r) => r.kind === 'bedroom' && !r.archivedAt && !taken.has(r.id))
}

export type NewInvite = { readonly maxUses?: number; readonly ttlDays?: number }

export const createInvite = (
  input: NewInvite,
  ctx: {
    houseId: HouseId
    defaultTtlDays: number
    openSpots: number
    by: UserId
    now: Instant
    id: InviteId
    tokenHash: string
    actionId: ActionId
  },
): Result<{ invite: Invite; events: DomainEvent[] }, 'bad_limits'> => {
  const maxUses = input.maxUses ?? Math.max(1, ctx.openSpots)
  const ttlDays = input.ttlDays ?? ctx.defaultTtlDays
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 20) return err('bad_limits')
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 30) return err('bad_limits')
  const invite: Invite = {
    id: ctx.id,
    houseId: ctx.houseId,
    tokenHash: ctx.tokenHash,
    createdBy: ctx.by,
    expiresAt: plusMs(ctx.now, ttlDays * MS_PER_DAY),
    maxUses,
    uses: 0,
  }
  return ok({
    invite,
    events: [
      {
        kind: 'invite.created',
        payload: { expiresAt: toIso(invite.expiresAt), maxUses },
        actionId: ctx.actionId,
        by: ctx.by,
      },
    ],
  })
}

export const revokeInvite = (
  inv: Invite,
  by: UserId,
  now: Instant,
  actionId: ActionId,
): Result<{ invite: Invite; events: DomainEvent[] }, 'already_revoked'> =>
  inv.revokedAt
    ? err('already_revoked')
    : ok({
        invite: { ...inv, revokedAt: now },
        events: [{ kind: 'invite.revoked', payload: {}, actionId, by }],
      })

export type Joining = {
  readonly userId: UserId
  readonly displayName: string
  /** The bedroom they picked ("Which room is yours?"), if any. */
  readonly room?: Room
}

/**
 * A person joins through a valid invite: their profile, their membership (with their bedroom,
 * which sets their color), one more use on the invite, and `member.joined` for everyone.
 * Someone who moved out can come back through a new invite.
 */
export const acceptInvite = (
  inv: Invite,
  joining: Joining,
  ctx: {
    now: Instant
    actionId: ActionId
    existingMember?: Member
    existingProfile?: Profile
    openBedrooms: readonly Room[]
  },
): Result<
  { invite: Invite; member: Member; profile: Profile; events: DomainEvent[] },
  InviteProblem | 'already_member' | 'room_taken' | 'empty_name'
> => {
  const valid = validateInvite(inv, ctx.now)
  if (!valid.ok) return valid
  const displayName = joining.displayName.trim()
  if (!displayName) return err('empty_name')
  if (ctx.existingMember?.status.active) return err('already_member')
  const room = joining.room
  if (room && (room.houseId !== inv.houseId || !ctx.openBedrooms.some((r) => r.id === room.id))) {
    return err('room_taken')
  }

  const member: Member = {
    houseId: inv.houseId,
    userId: joining.userId,
    role: ctx.existingMember?.role ?? 'member',
    joinedAt: ctx.now,
    status: { active: true },
    ...(room && { roomId: room.id }),
  }
  const profile: Profile = ctx.existingProfile
    ? { ...ctx.existingProfile, displayName }
    : { id: joining.userId, displayName, theme: 'auto', createdAt: ctx.now }
  const events: DomainEvent[] = [
    { kind: 'member.joined', memberId: joining.userId, actionId: ctx.actionId, by: joining.userId },
  ]
  if (room) {
    events.push({
      kind: 'member.room_changed',
      memberId: joining.userId,
      roomId: room.id,
      actionId: ctx.actionId,
      by: joining.userId,
    })
  }
  return ok({ invite: { ...inv, uses: inv.uses + 1 }, member, profile, events })
}

/** What the join page says about a problem (FRONTEND §7). */
export const inviteProblemCopy: Record<InviteProblem, string> = {
  invalid: "This invite link doesn't work. Ask a roommate for a fresh one.",
  expired: 'This invite has expired. Ask a roommate for a fresh link.',
  revoked: 'This invite was turned off. Ask a roommate for a fresh link.',
  used_up: 'This invite has been used up. Ask a roommate for a fresh link.',
}

/** Whether an error is about the invite itself (a refused token), not about the person joining. */
export const isInviteProblem = (e: string): e is InviteProblem =>
  Object.hasOwn(inviteProblemCopy, e)
