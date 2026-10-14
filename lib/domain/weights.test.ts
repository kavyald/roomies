import { describe, expect, it } from 'vitest'
import { DEFAULT_FEELING_WEIGHTS } from './feelings'
import { defaultHouseSettings, type House } from './house'
import { asId, type ActionId, type HouseId, type UserId } from './ids'
import { instant } from './time'
import { describeWeightsChange, isValidWeight, setFeelingWeights, stepWeight } from './weights'

const maya = asId<'user'>('maya') as UserId
const house: House = {
  id: asId<'house'>('h') as HouseId,
  name: 'The apartment',
  settings: defaultHouseSettings('America/New_York'),
  createdBy: maya,
  createdAt: instant(0),
}
const ctx = { by: maya, actionId: asId<'action'>('a') as ActionId }

describe('setFeelingWeights', () => {
  it('saves the new weights and records only what changed', () => {
    const r = setFeelingWeights(house, { ...DEFAULT_FEELING_WEIGHTS, anxious: 40 }, ctx)
    expect(r.ok && r.value.house.settings.feelingWeights.anxious).toBe(40)
    expect(r.ok && r.value.house.settings.timezone).toBe('America/New_York')
    expect(r.ok && r.value.events).toEqual([
      { kind: 'settings.feeling_weights_changed', changes: { anxious: [20, 40] }, ...ctx },
    ])
  })

  it('refuses weights outside −20…+40 or off the steps of 5', () => {
    for (const anxious of [45, -25, 12, 2.5, Number.NaN]) {
      expect(setFeelingWeights(house, { ...DEFAULT_FEELING_WEIGHTS, anxious }, ctx)).toEqual({
        ok: false,
        error: 'out_of_range',
      })
    }
  })

  it('says when nothing changed', () => {
    expect(setFeelingWeights(house, DEFAULT_FEELING_WEIGHTS, ctx)).toEqual({
      ok: false,
      error: 'no_change',
    })
  })
})

describe('weights helpers', () => {
  it('validates and steps within range', () => {
    expect([-20, 0, 40, 35].every(isValidWeight)).toBe(true)
    expect([stepWeight(40, 1), stepWeight(-20, -1), stepWeight(20, 1), stepWeight(0, -1)]).toEqual([
      40, -20, 25, -5,
    ])
  })

  it('describes a change in words', () => {
    expect(describeWeightsChange({ anxious: [20, 30] })).toBe('set 😰 Anxious to +30')
    expect(describeWeightsChange({ meh: [0, -10] })).toBe('set 😌 Not a big deal to −10')
    expect(describeWeightsChange({ anxious: [40, 20], meh: [0, -5] })).toBe(
      'reset the feeling weights',
    )
    expect(describeWeightsChange({ anxious: [20, 25], meh: [-5, 0] })).toBe(
      'changed the feeling weights',
    )
    expect(describeWeightsChange(undefined)).toBe('changed the feeling weights')
  })
})
