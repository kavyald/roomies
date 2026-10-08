import { describe, expect, it } from 'vitest'
import { seqIds } from '../adapters/ids'
import type { UserId } from './ids'
import { safeEqual, setupHouse, type NewHouse } from './setup'
import { instant } from './time'

const owner = 'u-owner' as UserId
const now = instant(0)
const input: NewHouse = {
  houseName: ' The apartment ',
  timezone: 'America/New_York',
  ownerName: ' Kavya ',
  unit: '',
}

describe('setupHouse', () => {
  it('makes the house with default weights, the owner as admin, and the apartment rooms', () => {
    const r = setupHouse(input, owner, now, seqIds().newId)
    if (!r.ok) throw new Error(r.error)
    const { house, profile, member, rooms, events } = r.value
    expect(house).toMatchObject({ name: 'The apartment', createdBy: owner, createdAt: now })
    expect(house).not.toHaveProperty('unit')
    expect(house.settings).toEqual({
      timezone: 'America/New_York',
      feelingWeights: { anxious: 20, frustrated: 15, confused: 5, fine: 0, meh: -5, thanks: 0 },
      inviteTtlDays: 7,
    })
    expect(profile).toMatchObject({ id: owner, displayName: 'Kavya', theme: 'auto' })
    expect(member).toMatchObject({
      houseId: house.id,
      userId: owner,
      role: 'admin',
      status: { active: true },
    })
    expect(rooms).toHaveLength(17)
    expect(rooms.filter((x) => x.kind === 'bedroom').map((x) => [x.name, x.element])).toEqual([
      ['Air', 'air'],
      ['Fire', 'fire'],
      ['Water', 'water'],
      ['Earth', 'earth'],
    ])
    expect(rooms.map((x) => x.name)).toEqual(
      expect.arrayContaining(['Bathroom 3', 'Fitness space', 'Craft room', 'Garden']),
    )
    expect(new Set(rooms.map((x) => x.id)).size).toBe(17)
    expect(events).toEqual([{ kind: 'house.created', actionId: expect.any(String), by: owner }])
  })

  it('keeps an existing profile, renamed', () => {
    const existing = { id: owner, displayName: 'K', theme: 'dark' as const, createdAt: instant(5) }
    const r = setupHouse(input, owner, now, seqIds().newId, existing)
    expect(r.ok && r.value.profile).toEqual({ ...existing, displayName: 'Kavya' })
  })

  it.each([
    [{ houseName: '  ' }, 'empty_house_name'],
    [{ ownerName: '' }, 'empty_owner_name'],
    [{ timezone: 'Mars/Base' }, 'invalid_timezone'],
  ] as const)('refuses %j', (patch, error) => {
    expect(setupHouse({ ...input, ...patch }, owner, now, seqIds().newId)).toEqual({
      ok: false,
      error,
    })
  })
})

describe('safeEqual', () => {
  it.each([
    ['abc', 'abc', true],
    ['abc', 'abd', false],
    ['abc', 'abcd', false],
    ['', '', true],
  ])('%j vs %j → %s', (a, b, expected) => expect(safeEqual(a, b)).toBe(expected))
})
