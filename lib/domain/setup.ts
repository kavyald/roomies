// Setting up the one house (PRD §10, ARCHITECTURE §5.2). Pure: ids and time are passed in.

import type { DomainEvent } from './events'
import { defaultHouseSettings, type House, type Member, type Profile, type Room } from './house'
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
}

export type SetupError = 'empty_house_name' | 'empty_owner_name' | 'invalid_timezone'

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
 * The house with default feeling weights, its owner as admin, and the apartment's rooms.
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
  return ok({
    house,
    profile,
    member,
    rooms,
    events: [{ kind: 'house.created', actionId, by: owner }],
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
