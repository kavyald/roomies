// The house, its people, and its places (ARCHITECTURE §6.2).

import { DEFAULT_FEELING_WEIGHTS, type FeelingWeights } from './feelings'
import type { ContactId, HouseId, InviteId, RoomId, UserId } from './ids'
import type { Instant, LocalTime } from './time'

export type HouseSettings = {
  readonly timezone: string
  readonly feelingWeights: FeelingWeights
  readonly inviteTtlDays: number
}

export const defaultHouseSettings = (timezone: string): HouseSettings => ({
  timezone,
  feelingWeights: DEFAULT_FEELING_WEIGHTS,
  inviteTtlDays: 7,
})

export type House = {
  readonly id: HouseId
  readonly name: string
  readonly address?: string
  readonly unit?: string
  readonly settings: HouseSettings
  readonly createdBy: UserId
  readonly createdAt: Instant
}

export type Theme = 'auto' | 'light' | 'dark'

export type Profile = {
  readonly id: UserId
  readonly displayName: string
  readonly theme: Theme
  readonly timezone?: string
  readonly quietHours?: { readonly start: LocalTime; readonly end: LocalTime }
  readonly createdAt: Instant
}

export type Role = 'admin' | 'member'

export type Member = {
  readonly houseId: HouseId
  readonly userId: UserId
  readonly role: Role
  readonly roomId?: RoomId
  readonly joinedAt: Instant
  readonly status: { readonly active: true } | { readonly active: false; readonly leftAt: Instant }
}

export const isActiveMember = (m: Member | undefined): m is Member => m?.status.active === true

export type Element = 'air' | 'fire' | 'water' | 'earth'
export type Floor = 'first' | 'basement' | 'outside'
export type RoomKind = 'bedroom' | 'bath' | 'common' | 'entry' | 'utility' | 'outdoor'

export type Room = {
  readonly id: RoomId
  readonly houseId: HouseId
  readonly name: string
  readonly floor: Floor
  readonly kind: RoomKind
  readonly element?: Element
  readonly sortOrder: number
  readonly archivedAt?: Instant
}

export type Contact = {
  readonly id: ContactId
  readonly houseId: HouseId
  readonly name: string
  readonly phone?: string
  readonly note?: string
  /** Contacts are archived, never deleted: activity rows point at them. */
  readonly archivedAt?: Instant
}

export type Invite = {
  readonly id: InviteId
  readonly houseId: HouseId
  readonly tokenHash: string
  readonly createdBy: UserId
  readonly expiresAt: Instant
  readonly maxUses: number
  readonly uses: number
  readonly revokedAt?: Instant
}
