import type { HouseId, UserId } from './ids'

/**
 * Who is acting:
 * - a member, acting inside a house;
 * - a signed-in user before any house is in play (finding their house, setting one up);
 * - Roomies itself (scheduled jobs).
 */
export type Actor =
  | { readonly kind: 'member'; readonly userId: UserId; readonly houseId: HouseId }
  | { readonly kind: 'user'; readonly userId: UserId }
  | { readonly kind: 'system'; readonly houseId: HouseId }

/** An actor tied to a house: what most use cases need. */
export type HouseActor = Extract<Actor, { houseId: HouseId }>

/** The user behind an action, or null for Roomies (jobs). */
export const actorUser = (a: Actor): UserId | null => (a.kind === 'system' ? null : a.userId)
