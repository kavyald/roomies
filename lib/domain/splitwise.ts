// The house's Splitwise group (T89): a link any roommate pastes in Admin, which a cost's Splitwise
// icon opens. Splitwise has no link that pre-fills an expense, so the icon copies the line too
// (`splitwiseText` in costs.ts). Pure.

import type { DomainEvent, FieldChanges } from './events'
import type { House } from './house'
import type { ActionId, UserId } from './ids'
import { err, ok, type Result } from './result'

/** Where the icon goes when the house hasn't linked a group. */
export const SPLITWISE_HOME = 'https://secure.splitwise.com/'

const GROUP_URL = (id: string) => `https://secure.splitwise.com/#/groups/${id}`

/**
 * A pasted group link, as one shape: "https://secure.splitwise.com/#/groups/12345678". Takes what
 * the address bar or the app's share sheet gives (with or without https, www or secure, with or
 * without the "#/", with a trailing slash or a tab after the id).
 */
export const parseSplitwiseGroup = (input: string): Result<string, 'invalid'> => {
  const m =
    /^(?:https?:\/\/)?(?:www\.|secure\.)?splitwise\.com\/(?:#\/)?groups\/(\d{1,15})(?:[/?#][^\s]*)?$/i.exec(
      input.trim(),
    )
  return m ? ok(GROUP_URL(m[1]!)) : err('invalid')
}

/** What the icon opens: the house's group, or Splitwise's home page until one is linked. */
export const splitwiseUrl = (settings: { readonly splitwiseGroup?: string }): string =>
  settings.splitwiseGroup ?? SPLITWISE_HOME

/** Links, changes or (with `null`) unlinks the house's group. Any roommate may. */
export const setSplitwiseGroup = (
  house: House,
  link: string | null,
  ctx: { by: UserId; actionId: ActionId },
): Result<{ house: House; events: DomainEvent[] }, 'invalid' | 'no_change'> => {
  let next: string | undefined
  if (link !== null && link.trim() !== '') {
    const parsed = parseSplitwiseGroup(link)
    if (!parsed.ok) return parsed
    next = parsed.value
  }
  const before = house.settings.splitwiseGroup
  if (next === before) return err('no_change')
  const { splitwiseGroup: _old, ...rest } = house.settings
  return ok({
    house: { ...house, settings: { ...rest, ...(next && { splitwiseGroup: next }) } },
    events: [
      {
        kind: 'settings.splitwise_changed',
        changes: { splitwise_group: [before ?? null, next ?? null] } as FieldChanges,
        actionId: ctx.actionId,
        by: ctx.by,
      },
    ],
  })
}

/** "linked the Splitwise group", "changed the Splitwise group" or "unlinked the Splitwise group". */
export const describeSplitwiseChange = (changes: FieldChanges | undefined): string => {
  const [before, after] = (changes?.splitwise_group ?? [null, null]) as readonly [unknown, unknown]
  if (!after) return 'unlinked the Splitwise group'
  return before ? 'changed the Splitwise group' : 'linked the Splitwise group'
}
