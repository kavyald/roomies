import type { HouseId, UserId } from './ids'

/** Who is acting: a signed-in member, or Roomies itself (scheduled jobs). */
export type Actor =
  | { readonly kind: 'member'; readonly userId: UserId; readonly houseId: HouseId }
  | { readonly kind: 'system'; readonly houseId: HouseId }

/** The user behind an action, or null for Roomies (jobs). */
export const actorUser = (a: Actor): UserId | null => (a.kind === 'member' ? a.userId : null)
