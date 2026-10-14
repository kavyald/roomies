// People in the house: moving out, being removed, roles (PRD §10). Nothing is deleted; a member
// who leaves keeps their row, marked moved out, and their name stays on past items.

import type { DomainEvent } from './events'
import type { Member, Profile, Role } from './house'
import type { ActionId, UserId } from './ids'
import { err, ok, type Result } from './result'
import type { Instant } from './time'

const activeAdmins = (members: readonly Member[]) =>
  members.filter((m) => m.status.active && m.role === 'admin')

const isAdminIn = (members: readonly Member[], userId: UserId) =>
  activeAdmins(members).some((m) => m.userId === userId)

/**
 * A member leaves: by themselves ("I moved out") or removed by an admin. The last admin can't
 * leave, so the house always has someone who can invite.
 */
export const moveOut = (
  target: Member,
  members: readonly Member[],
  by: UserId,
  now: Instant,
  actionId: ActionId,
  note?: string,
): Result<
  { member: Member; events: DomainEvent[] },
  'not_allowed' | 'already_moved_out' | 'last_admin'
> => {
  const self = by === target.userId
  if (!self && !isAdminIn(members, by)) return err('not_allowed')
  if (!target.status.active) return err('already_moved_out')
  if (target.role === 'admin' && activeAdmins(members).every((m) => m.userId === target.userId)) {
    return err('last_admin')
  }
  const trimmed = note?.trim()
  return ok({
    member: { ...target, status: { active: false, leftAt: now } },
    events: [
      {
        kind: self ? 'member.moved_out' : 'member.removed',
        memberId: target.userId,
        ...(trimmed && { note: trimmed }),
        actionId,
        by,
      },
    ],
  })
}

/** Admins change roles; the house keeps at least one admin. */
export const setRole = (
  target: Member,
  role: Role,
  members: readonly Member[],
  by: UserId,
  actionId: ActionId,
): Result<
  { member: Member; events: DomainEvent[] },
  'not_allowed' | 'no_change' | 'last_admin' | 'not_active'
> => {
  if (!isAdminIn(members, by)) return err('not_allowed')
  if (!target.status.active) return err('not_active')
  if (target.role === role) return err('no_change')
  if (role === 'member' && activeAdmins(members).every((m) => m.userId === target.userId)) {
    return err('last_admin')
  }
  return ok({
    member: { ...target, role },
    events: [
      {
        kind: 'member.role_changed',
        memberId: target.userId,
        changes: { role: [target.role, role] },
        actionId,
        by,
      },
    ],
  })
}

export const FORMER_ROOMMATE = 'Former roommate'

/** Deleting an account keeps the profile row (activity points at it) but nothing personal. */
export const anonymizeProfile = (p: Profile): Profile => ({
  id: p.id,
  displayName: FORMER_ROOMMATE,
  theme: 'auto',
  createdAt: p.createdAt,
})
