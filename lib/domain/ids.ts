// Branded ids: a UserId can't be passed where an ItemId is expected.

export type Id<K extends string> = string & { readonly __id: K }

export type UserId = Id<'user'>
export type HouseId = Id<'house'>
export type ItemId = Id<'item'>
export type RoomId = Id<'room'>
export type ContactId = Id<'contact'>
export type InviteId = Id<'invite'>
export type PollId = Id<'poll'>
export type OptionId = Id<'option'>
export type RunId = Id<'run'>
export type CostId = Id<'cost'>
export type ActionId = Id<'action'>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (s: string): boolean => UUID.test(s)

/** Brands a string that is already known to be an id (from the database or an IdGenerator). */
export const asId = <K extends string>(s: string): Id<K> => s as Id<K>
