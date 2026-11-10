import { describe, expect, it } from 'vitest'
import type { Member, Room } from './house'
import { asId, type ActionId, type HouseId, type RoomId, type UserId } from './ids'
import { anonymizeProfile, changeMyRoom, moveOut, setRole } from './members'
import { instant } from './time'

const h = asId<'house'>('h') as HouseId
const [kavya, sam, wren] = ['kavya', 'sam', 'wren'].map((u) => asId<'user'>(u) as UserId) as [
  UserId,
  UserId,
  UserId,
]
const a = asId<'action'>('a') as ActionId
const now = instant(1000)
const m = (userId: UserId, o: Partial<Member> = {}): Member => ({
  houseId: h,
  userId,
  role: 'member',
  joinedAt: instant(0),
  status: { active: true },
  ...o,
})
const house = [m(kavya, { role: 'admin' }), m(sam), m(wren)]

describe('moveOut', () => {
  it('lets a member move themselves out', () => {
    const r = moveOut(house[1]!, house, sam, now, a)
    expect(r.ok && r.value.member.status).toEqual({ active: false, leftAt: now })
    expect(r.ok && r.value.events).toEqual([
      { kind: 'member.moved_out', memberId: sam, actionId: a, by: sam },
    ])
  })

  it('lets an admin remove someone, with a note', () => {
    const r = moveOut(house[2]!, house, kavya, now, a, ' Lease ended ')
    expect(r.ok && r.value.events).toEqual([
      { kind: 'member.removed', memberId: wren, note: 'Lease ended', actionId: a, by: kavya },
    ])
  })

  it.each([
    ['a member removing someone else', house[2]!, house, sam, 'not_allowed'],
    [
      'someone already gone',
      m(sam, { status: { active: false, leftAt: now } }),
      house,
      kavya,
      'already_moved_out',
    ],
    ['the last admin', house[0]!, house, kavya, 'last_admin'],
  ] as const)('refuses %s', (_l, target, members, by, error) => {
    expect(moveOut(target, members, by, now, a)).toEqual({ ok: false, error })
  })

  it('lets an admin leave when another admin stays', () => {
    const two = [m(kavya, { role: 'admin' }), m(sam, { role: 'admin' })]
    expect(moveOut(two[0]!, two, kavya, now, a).ok).toBe(true)
  })
})

describe('setRole', () => {
  it('makes someone an admin, recording the change', () => {
    const r = setRole(house[1]!, 'admin', house, kavya, a)
    expect(r.ok && r.value.member.role).toBe('admin')
    expect(r.ok && r.value.events[0]).toMatchObject({
      kind: 'member.role_changed',
      changes: { role: ['member', 'admin'] },
    })
  })

  it.each([
    ['from a non-admin', house[2]!, 'admin', sam, 'not_allowed'],
    ['with no change', house[1]!, 'member', kavya, 'no_change'],
    ['that leaves no admin', house[0]!, 'member', kavya, 'last_admin'],
    [
      'for someone gone',
      m(sam, { status: { active: false, leftAt: now } }),
      'admin',
      kavya,
      'not_active',
    ],
  ] as const)('refuses a change %s', (_l, target, role, by, error) => {
    expect(setRole(target, role, house, by, a)).toEqual({ ok: false, error })
  })
})

describe('anonymizeProfile', () => {
  it('keeps nothing personal', () => {
    expect(
      anonymizeProfile({
        id: sam,
        displayName: 'Sam',
        theme: 'dark',
        timezone: 'Europe/London',
        quietHours: { start: '22:00' as never, end: '07:00' as never },
        createdAt: instant(5),
      }),
    ).toEqual({ id: sam, displayName: 'Former roommate', theme: 'auto', createdAt: instant(5) })
  })
})

describe('changeMyRoom', () => {
  const room = (id: string): Room =>
    ({ id: asId<'room'>(id) as RoomId, houseId: h, name: id, kind: 'bedroom' }) as Room
  const [fire, water] = [room('fire'), room('water')]

  it('moves you into an open bedroom, recording it', () => {
    const r = changeMyRoom(m(sam), fire.id, [fire, water], a)
    expect(r.ok && r.value.member.roomId).toBe(fire.id)
    expect(r.ok && r.value.events).toEqual([
      { kind: 'member.room_changed', memberId: sam, roomId: fire.id, actionId: a, by: sam },
    ])
  })

  it('clears your bedroom with no room on the event', () => {
    const r = changeMyRoom(m(sam, { roomId: fire.id }), null, [water], a)
    expect(r.ok && r.value.member).not.toHaveProperty('roomId')
    expect(r.ok && r.value.events).toEqual([
      { kind: 'member.room_changed', memberId: sam, actionId: a, by: sam },
    ])
  })

  it("refuses a bedroom that isn't open, the same room, and someone who moved out", () => {
    expect(changeMyRoom(m(sam), fire.id, [water], a)).toEqual({ ok: false, error: 'room_taken' })
    expect(changeMyRoom(m(sam, { roomId: fire.id }), fire.id, [water], a)).toEqual({
      ok: false,
      error: 'no_change',
    })
    expect(changeMyRoom(m(sam), null, [], a)).toEqual({ ok: false, error: 'no_change' })
    const gone = m(sam, { status: { active: false, leftAt: now } })
    expect(changeMyRoom(gone, water.id, [water], a)).toEqual({ ok: false, error: 'not_active' })
  })
})
