// Setting up the one house (PRD §10, ARCHITECTURE §5.2). Pure: ids and time are passed in.

import type { DomainEvent } from './events'
import { defaultHouseSettings, type Element, type House, type Member, type Profile, type Room } from './house'
import type { ActionId, HouseId, Id, UserId } from './ids'
import { err, ok, type Result } from './result'
import { APARTMENT_ROOMS } from './rooms'
import { isTimeZone, type Instant } from './time'

export type NewHouse = {
  readonly houseName: string
  readonly address?: string
  readonly unit?: string
  readonly timezone: string
  /** The owner's name, shown to everyone (their profile). */
  readonly ownerName: string
  /** The owner's bedroom, by its element ("Which room is yours?", T93); none is "Not yet". */
  readonly bedroom?: Element
}

export type SetupError = 'empty_house_name' | 'empty_owner_name' | 'invalid_timezone' | 'room_taken'

export type HouseSetup = {
  house: House
  profile: Profile
  member: Member
  rooms: Room[]
  events: DomainEvent[]
}

const clean = (s: string | undefined) => {
  const t = s?.trim()
  return t ? t : undefined
}

/**
 * The house with default feeling weights, its owner as admin ("organizer" on screen), the
 * apartment's rooms, and the owner's bedroom if they picked one.
 * `existingProfile` keeps the owner's other settings if they already have a profile.
 */
export const setupHouse = (
  input: NewHouse,
  owner: UserId,
  now: Instant,
  newId: <K extends string>() => Id<K>,
  existingProfile?: Profile,
): Result<HouseSetup, SetupError> => {
  const houseName = clean(input.houseName)
  const ownerName = clean(input.ownerName)
  if (!houseName) return err('empty_house_name')
  if (!ownerName) return err('empty_owner_name')
  if (!isTimeZone(input.timezone)) return err('invalid_timezone')
  if (
    input.bedroom &&
    !APARTMENT_ROOMS.some((r) => r.kind === 'bedroom' && r.element === input.bedroom)
  ) {
    return err('room_taken')
  }

  const houseId = newId<'house'>() as HouseId
  const address = clean(input.address)
  const unit = clean(input.unit)
  const house: House = {
    id: houseId,
    name: houseName,
    ...(address && { address }),
    ...(unit && { unit }),
    settings: defaultHouseSettings(input.timezone),
    createdBy: owner,
    createdAt: now,
  }
  const profile: Profile = existingProfile
    ? { ...existingProfile, displayName: ownerName }
    : { id: owner, displayName: ownerName, theme: 'auto', createdAt: now }
  const member: Member = {
    houseId,
    userId: owner,
    role: 'admin',
    joinedAt: now,
    status: { active: true },
  }
  const rooms: Room[] = APARTMENT_ROOMS.map((r, i) => ({
    id: newId<'room'>(),
    houseId,
    name: r.name,
    floor: r.floor,
    kind: r.kind,
    ...(r.element && { element: r.element }),
    sortOrder: i,
  }))
  const actionId = newId<'action'>() as ActionId
  const bedroom = input.bedroom && rooms.find((r) => r.element === input.bedroom)
  const events: DomainEvent[] = [{ kind: 'house.created', actionId, by: owner }]
  if (bedroom) {
    events.push({
      kind: 'member.room_changed',
      memberId: owner,
      roomId: bedroom.id,
      actionId,
      by: owner,
    })
  }
  return ok({
    house,
    profile,
    member: bedroom ? { ...member, roomId: bedroom.id } : member,
    rooms,
    events,
  })
}

/** Compares secrets in time that doesn't depend on where they differ. */
export const safeEqual = (a: string, b: string): boolean => {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}
