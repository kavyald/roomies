import { describe, expect, it } from 'vitest'
import { defaultHouseSettings, type House } from './house'
import type { ActionId, HouseId, UserId } from './ids'
import {
  describeSplitwiseChange,
  parseSplitwiseGroup,
  setSplitwiseGroup,
  SPLITWISE_HOME,
  splitwiseUrl,
} from './splitwise'
import { instant } from './time'

const GROUP = 'https://secure.splitwise.com/#/groups/12345678'
const by = 'u-1' as UserId
const ctx = { by, actionId: 'a-1' as ActionId }
const house = (splitwiseGroup?: string): House => ({
  id: 'h-1' as HouseId,
  name: 'The apartment',
  settings: {
    ...defaultHouseSettings('America/New_York'),
    ...(splitwiseGroup && { splitwiseGroup }),
  },
  createdBy: by,
  createdAt: instant(0),
})

describe('parseSplitwiseGroup', () => {
  it.each([
    GROUP,
    'https://secure.splitwise.com/#/groups/12345678/',
    'secure.splitwise.com/#/groups/12345678',
    'https://www.splitwise.com/groups/12345678',
    'splitwise.com/groups/12345678?tab=expenses',
    '  https://secure.splitwise.com/#/groups/12345678  ',
    'HTTPS://SECURE.SPLITWISE.COM/#/groups/12345678',
  ])('reads %j as the group link', (input) => {
    expect(parseSplitwiseGroup(input)).toEqual({ ok: true, value: GROUP })
  })

  it.each([
    '',
    'https://secure.splitwise.com/',
    'https://secure.splitwise.com/#/groups/',
    'https://secure.splitwise.com/#/friends/12345678',
    'https://splitwise.com.evil.example/groups/12345678',
    'https://evil.example/splitwise.com/groups/12345678',
    'javascript:alert(1)//splitwise.com/groups/1',
    'https://www.splitwise.com/join/abQwErTyuI+12',
  ])('refuses %j', (input) => {
    expect(parseSplitwiseGroup(input)).toEqual({ ok: false, error: 'invalid' })
  })
})

describe('splitwiseUrl', () => {
  it("opens the house's group, or Splitwise's home page until one is linked", () => {
    expect(splitwiseUrl({ splitwiseGroup: GROUP })).toBe(GROUP)
    expect(splitwiseUrl({})).toBe(SPLITWISE_HOME)
  })
})

describe('setSplitwiseGroup', () => {
  it('links a group, keeping the link in one shape, and says what changed', () => {
    const r = setSplitwiseGroup(house(), 'splitwise.com/groups/12345678', ctx)
    expect(r.ok && r.value.house.settings.splitwiseGroup).toBe(GROUP)
    expect(r.ok && r.value.events).toEqual([
      {
        kind: 'settings.splitwise_changed',
        changes: { splitwise_group: [null, GROUP] },
        actionId: ctx.actionId,
        by,
      },
    ])
  })

  it('changes and unlinks it (null or blank)', () => {
    const changed = setSplitwiseGroup(house(GROUP), 'https://secure.splitwise.com/#/groups/9', ctx)
    expect(changed.ok && changed.value.events[0]).toMatchObject({
      changes: { splitwise_group: [GROUP, 'https://secure.splitwise.com/#/groups/9'] },
    })
    for (const link of [null, '   ']) {
      const r = setSplitwiseGroup(house(GROUP), link, ctx)
      expect(r.ok && 'splitwiseGroup' in r.value.house.settings).toBe(false)
      expect(r.ok && r.value.events[0]).toMatchObject({
        changes: { splitwise_group: [GROUP, null] },
      })
    }
  })

  it('refuses a link that is not a Splitwise group, and a save that changes nothing', () => {
    expect(setSplitwiseGroup(house(), 'https://example.com', ctx)).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(setSplitwiseGroup(house(GROUP), GROUP, ctx)).toEqual({ ok: false, error: 'no_change' })
    expect(setSplitwiseGroup(house(), null, ctx)).toEqual({ ok: false, error: 'no_change' })
  })
})

describe('describeSplitwiseChange', () => {
  it('says linked, changed or unlinked', () => {
    expect(describeSplitwiseChange({ splitwise_group: [null, GROUP] })).toBe(
      'linked the Splitwise group',
    )
    expect(describeSplitwiseChange({ splitwise_group: [GROUP, `${GROUP}9`] })).toBe(
      'changed the Splitwise group',
    )
    expect(describeSplitwiseChange({ splitwise_group: [GROUP, null] })).toBe(
      'unlinked the Splitwise group',
    )
  })
})
