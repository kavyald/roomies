// Builders for domain objects (TESTING.md §4). Each takes the ids it needs plus overrides, and
// fills everything else with plausible values. Item/poll/run builders join with their tasks.

import type { IdGenerator } from '../app/ports'
import {
  defaultHouseSettings,
  type Contact,
  type House,
  type Invite,
  type Member,
  type Profile,
  type Room,
} from '../domain/house'
import type { HouseId, UserId } from '../domain/ids'
import { instant, plusMs, MS_PER_DAY, type Instant } from '../domain/time'

export const T0: Instant = instant(Date.UTC(2026, 8, 29, 16, 0)) // Tue 2026-09-29, noon in New York

export const aHouse = (ids: IdGenerator, createdBy: UserId, o: Partial<House> = {}): House => ({
  id: ids.newId(),
  name: 'The apartment',
  settings: defaultHouseSettings('America/New_York'),
  createdBy,
  createdAt: T0,
  ...o,
})

export const aProfile = (id: UserId, o: Partial<Profile> = {}): Profile => ({
  id,
  displayName: 'Kavya',
  theme: 'auto',
  createdAt: T0,
  ...o,
})

export const aMember = (houseId: HouseId, userId: UserId, o: Partial<Member> = {}): Member => ({
  houseId,
  userId,
  role: 'member',
  joinedAt: T0,
  status: { active: true },
  ...o,
})

export const aRoom = (ids: IdGenerator, houseId: HouseId, o: Partial<Room> = {}): Room => ({
  id: ids.newId(),
  houseId,
  name: 'Kitchen',
  floor: 'first',
  kind: 'common',
  sortOrder: 0,
  ...o,
})

export const aContact = (
  ids: IdGenerator,
  houseId: HouseId,
  o: Partial<Contact> = {},
): Contact => ({
  id: ids.newId(),
  houseId,
  name: 'Super',
  phone: '(555) 010-2231',
  ...o,
})

export const anInvite = (
  ids: IdGenerator,
  houseId: HouseId,
  createdBy: UserId,
  o: Partial<Invite> = {},
): Invite => ({
  id: ids.newId(),
  houseId,
  tokenHash: `hash-${ids.newId()}`,
  createdBy,
  expiresAt: plusMs(T0, 7 * MS_PER_DAY),
  maxUses: 3,
  uses: 0,
  ...o,
})
