import { describe, expect, it } from 'vitest'
import type { Invite, Member, Room } from './house'
import { asId, type ActionId, type HouseId, type InviteId, type RoomId, type UserId } from './ids'
import {
  acceptInvite,
  createInvite,
  isInviteProblem,
  openBedrooms,
  revokeInvite,
  validateInvite,
} from './invites'
import { instant, MS_PER_DAY, plusMs } from './time'

const houseId = asId<'house'>('h1') as HouseId
const admin = asId<'user'>('admin') as UserId
const sam = asId<'user'>('sam') as UserId
const now = instant(Date.UTC(2026, 8, 29, 16, 0))
const action = asId<'action'>('a1') as ActionId

const invite = (o: Partial<Invite> = {}): Invite => ({
  id: asId<'invite'>('i1') as InviteId,
  houseId,
  tokenHash: 'h',
  createdBy: admin,
  expiresAt: plusMs(now, MS_PER_DAY),
  maxUses: 2,
  uses: 0,
  ...o,
})
const room = (id: string, o: Partial<Room> = {}): Room => ({
  id: asId<'room'>(id) as RoomId,
  houseId,
  name: id,
  floor: 'first',
  kind: 'bedroom',
  sortOrder: 0,
  ...o,
})
const member = (userId: UserId, o: Partial<Member> = {}): Member => ({
  houseId,
  userId,
  role: 'member',
  joinedAt: now,
  status: { active: true },
  ...o,
})

describe('validateInvite', () => {
  it.each([
    ['no invite matched the token', undefined, 'invalid'],
    ['revoked', invite({ revokedAt: now }), 'revoked'],
    ['expired at the exact moment', invite({ expiresAt: now }), 'expired'],
    ['expired yesterday', invite({ expiresAt: plusMs(now, -MS_PER_DAY) }), 'expired'],
    ['used up', invite({ uses: 2, maxUses: 2 }), 'used_up'],
    ['revoked and expired says revoked', invite({ revokedAt: now, expiresAt: now }), 'revoked'],
  ] as const)('%s → %s', (_label, inv, error) => {
    expect(validateInvite(inv, now)).toEqual({ ok: false, error })
  })

  it('lets a good invite through', () => {
    expect(validateInvite(invite({ uses: 1 }), now)).toEqual({
      ok: true,
      value: invite({ uses: 1 }),
    })
  })
})

describe('openBedrooms', () => {
  it('lists bedrooms nobody active lives in', () => {
    const rooms = [
      room('air'),
      room('fire'),
      room('water', { archivedAt: now }),
      room('kitchen', { kind: 'common' }),
    ]
    const members = [
      member(admin, { roomId: rooms[0]!.id }),
      member(sam, { roomId: rooms[1]!.id, status: { active: false, leftAt: now } }),
    ]
    expect(openBedrooms(rooms, members).map((r) => r.name)).toEqual(['fire'])
  })
})

describe('createInvite', () => {
  const ctx = {
    houseId,
    defaultTtlDays: 7,
    openSpots: 3,
    by: admin,
    now,
    id: asId<'invite'>('new') as InviteId,
    tokenHash: 'hash',
    actionId: action,
  }

  it('defaults to one use per open spot and the house expiry', () => {
    const r = createInvite({}, ctx)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.invite).toMatchObject({
      maxUses: 3,
      uses: 0,
      expiresAt: plusMs(now, 7 * MS_PER_DAY),
      tokenHash: 'hash',
    })
    expect(r.value.events).toEqual([
      {
        kind: 'invite.created',
        payload: { maxUses: 3, expiresAt: '2026-10-06T16:00:00.000Z' },
        actionId: action,
        by: admin,
      },
    ])
    expect(
      createInvite({}, { ...ctx, openSpots: 0 }).ok && createInvite({}, { ...ctx, openSpots: 0 }),
    ).toMatchObject({ value: { invite: { maxUses: 1 } } })
  })

  it.each([{ maxUses: 0 }, { maxUses: 21 }, { ttlDays: 0 }, { ttlDays: 1.5 }])(
    'refuses odd limits %j',
    (input) => {
      expect(createInvite(input, ctx)).toEqual({ ok: false, error: 'bad_limits' })
    },
  )
})

describe('revokeInvite', () => {
  it('turns an invite off once', () => {
    const r = revokeInvite(invite(), admin, now, action)
    expect(r.ok && r.value.invite.revokedAt).toEqual(now)
    expect(r.ok && r.value.events[0]!.kind).toBe('invite.revoked')
    expect(revokeInvite(invite({ revokedAt: now }), admin, now, action)).toEqual({
      ok: false,
      error: 'already_revoked',
    })
  })
})

describe('acceptInvite', () => {
  const fire = room('fire', { element: 'fire' })
  const ctx = { now, actionId: action, openBedrooms: [fire] }

  it('makes the member with their bedroom, uses the invite once, and tells everyone', () => {
    const r = acceptInvite(invite(), { userId: sam, displayName: ' Sam ', room: fire }, ctx)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.member).toEqual({
      houseId,
      userId: sam,
      role: 'member',
      joinedAt: now,
      status: { active: true },
      roomId: fire.id,
    })
    expect(r.value.profile).toMatchObject({ id: sam, displayName: 'Sam' })
    expect(r.value.invite.uses).toBe(1)
    expect(r.value.events.map((e) => e.kind)).toEqual(['member.joined', 'member.room_changed'])
    expect(new Set(r.value.events.map((e) => e.actionId)).size).toBe(1)
  })

  it('joins without a room too', () => {
    const r = acceptInvite(invite(), { userId: sam, displayName: 'Sam' }, ctx)
    expect(r.ok && r.value.events.map((e) => e.kind)).toEqual(['member.joined'])
    expect(r.ok && r.value.member).not.toHaveProperty('roomId')
  })

  it('welcomes back someone who moved out, keeping their profile', () => {
    const existingProfile = {
      id: sam,
      displayName: 'Old',
      theme: 'dark' as const,
      createdAt: instant(0),
    }
    const r = acceptInvite(
      invite(),
      { userId: sam, displayName: 'Sam' },
      {
        ...ctx,
        existingMember: member(sam, { status: { active: false, leftAt: now } }),
        existingProfile,
      },
    )
    expect(r.ok && r.value.member.status).toEqual({ active: true })
    expect(r.ok && r.value.profile).toEqual({ ...existingProfile, displayName: 'Sam' })
  })

  it.each([
    ['an expired invite', invite({ expiresAt: now }), {}, {}, 'expired'],
    ['a blank name', invite(), { displayName: ' ' }, {}, 'empty_name'],
    ['someone already in', invite(), {}, { existingMember: member(sam) }, 'already_member'],
    ['a taken room', invite(), { room: room('air', { element: 'air' }) }, {}, 'room_taken'],
  ] as const)('refuses %s', (_l, inv, joining, extra, error) => {
    expect(
      acceptInvite(inv, { userId: sam, displayName: 'Sam', ...joining }, { ...ctx, ...extra }),
    ).toEqual({ ok: false, error })
  })
})

describe('isInviteProblem', () => {
  it('is true for problems with the invite, not with the person joining', () => {
    expect(['invalid', 'expired', 'revoked', 'used_up'].every(isInviteProblem)).toBe(true)
    expect(['room_taken', 'already_member', 'empty_name', 'toString'].some(isInviteProblem)).toBe(
      false,
    )
  })
})
