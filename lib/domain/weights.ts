// The house's feeling weights (PRD §8.2): one setting for everyone, which any member can change.

import type { DomainEvent, FieldChanges } from './events'
import {
  DEFAULT_FEELING_WEIGHTS,
  FEELING_KINDS,
  FEELING_META,
  type FeelingKind,
  type FeelingWeights,
} from './feelings'
import type { House } from './house'
import type { ActionId, UserId } from './ids'
import { err, ok, type Result } from './result'

export const WEIGHT_MIN = -20
export const WEIGHT_MAX = 40
export const WEIGHT_STEP = 5

export const isValidWeight = (n: number): boolean =>
  Number.isInteger(n) && n >= WEIGHT_MIN && n <= WEIGHT_MAX && n % WEIGHT_STEP === 0

/** One step up or down, kept inside −20…+40. */
export const stepWeight = (n: number, direction: 1 | -1): number =>
  Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, n + direction * WEIGHT_STEP))

/** Saves new weights for the house. The event holds each changed weight as [before, after]. */
export const setFeelingWeights = (
  house: House,
  next: FeelingWeights,
  ctx: { by: UserId; actionId: ActionId },
): Result<{ house: House; events: DomainEvent[] }, 'out_of_range' | 'no_change'> => {
  if (!FEELING_KINDS.every((k) => isValidWeight(next[k]))) return err('out_of_range')
  const before = house.settings.feelingWeights
  const changes: Record<string, readonly [number, number]> = {}
  for (const k of FEELING_KINDS) if (before[k] !== next[k]) changes[k] = [before[k], next[k]]
  if (Object.keys(changes).length === 0) return err('no_change')
  const weights = Object.fromEntries(FEELING_KINDS.map((k) => [k, next[k]])) as FeelingWeights
  return ok({
    house: { ...house, settings: { ...house.settings, feelingWeights: weights } },
    events: [
      {
        kind: 'settings.feeling_weights_changed',
        changes: changes as FieldChanges,
        actionId: ctx.actionId,
        by: ctx.by,
      },
    ],
  })
}

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)

/**
 * What a weights change did, for the activity log and the Home card: "set 😰 Anxious to +30",
 * "reset the feeling weights", or "changed the feeling weights".
 */
export const describeWeightsChange = (changes: FieldChanges | undefined): string => {
  const entries = Object.entries(changes ?? {}).filter(([k]) => k in FEELING_META) as [
    FeelingKind,
    readonly [unknown, unknown],
  ][]
  if (entries.length === 1) {
    const [kind, [, after]] = entries[0]!
    return `set ${FEELING_META[kind].emoji} ${FEELING_META[kind].label} to ${signed(Number(after))}`
  }
  if (entries.length > 1 && entries.every(([k, [, after]]) => after === DEFAULT_FEELING_WEIGHTS[k]))
    return 'reset the feeling weights'
  return 'changed the feeling weights'
}
