import { describe, expect, it } from 'vitest'
import {
  CHORE_ICON_GROUPS,
  CHORE_ICONS,
  choreIconGroup,
  choreIconLabel,
  isChoreIcon,
  searchIcons,
  suggestIcons,
} from './icons'

// The names T96 shipped with: chores and routines saved with them must stay valid.
const SHIPPED = [
  'broom',
  'brush-cleaning',
  'spray-can',
  'sparkles',
  'droplets',
  'utensils',
  'cooking-pot',
  'refrigerator',
  'microwave',
  'toilet',
  'bath',
  'shower-head',
  'soap-dispenser-droplet',
  'washing-machine',
  'shirt',
  'sofa',
  'bed',
  'lamp',
  'door-open',
  'fan',
  'trash-2',
  'recycle',
  'package',
  'leaf',
  'sprout',
  'flower',
  'trees',
  'shovel',
  'hammer',
  'wrench',
  'paintbrush',
  'lightbulb',
  'blinds',
  'armchair',
  'dumbbell',
  'scissors',
  'dog',
  'cat',
  'car',
  'house',
]

describe('the icon list', () => {
  it('is curated, keeps every shipped name, and never offers wind (the Air element)', () => {
    expect(CHORE_ICONS.length).toBeGreaterThanOrEqual(90)
    expect(new Set(CHORE_ICONS).size).toBe(CHORE_ICONS.length)
    for (const name of SHIPPED) expect(isChoreIcon(name)).toBe(true)
    expect(isChoreIcon('wind')).toBe(false)
    expect(isChoreIcon('toString')).toBe(false)
  })

  it('puts every icon in a group, and every group has icons', () => {
    for (const group of CHORE_ICON_GROUPS)
      expect(CHORE_ICONS.some((n) => choreIconGroup(n) === group)).toBe(true)
  })

  it('names each icon so no two read the same to VoiceOver', () => {
    const labels = CHORE_ICONS.map(choreIconLabel)
    expect(new Set(labels).size).toBe(labels.length)
    expect(choreIconLabel('spray-can')).toBe('Spray can')
    expect(choreIconLabel('trash-2')).toBe('Trash')
    expect(choreIconLabel('flower-2')).toBe('Bouquet')
  })
})

describe('suggestIcons', () => {
  it.each([
    ['Swiffer', 'mop'],
    ['Vacuum', 'robot-vacuum'],
    ['Dust', 'feather'],
    ['Wipe stove', 'flame'],
    ['Scrub toilet', 'toilet'],
    ['Clean sink', 'soap-dispenser-droplet'],
    ['Clean mirror', 'spray-can'],
    ['Wipe counters', 'spray-can'],
    ['Take out trash', 'trash-2'],
    ['Water plants', 'plant-pot'],
    ['Clean the fridge!', 'refrigerator'],
    ['Do the dishes', 'utensils'],
    ['Change bed sheets', 'bed'],
  ])('suggests the right icon first for "%s"', (title, first) => {
    expect(suggestIcons(title)[0]).toBe(first)
  })

  it("offers a few runners-up and nothing for words it doesn't know", () => {
    expect(suggestIcons('Vacuum')).toContain('broom')
    expect(suggestIcons('Sweep the floors', 3)).toHaveLength(3)
    expect(suggestIcons('Zorp')).toEqual([])
    expect(suggestIcons('   ')).toEqual([])
  })
})

describe('searchIcons', () => {
  it('finds icons by the start of a word or name, in list order', () => {
    expect(searchIcons('vac')).toContain('robot-vacuum')
    expect(searchIcons('swif')).toEqual(['mop', 'mop-sparkles'])
    expect(searchIcons('Bouq')).toEqual(['flower-2'])
    expect(searchIcons('')).toHaveLength(CHORE_ICONS.length)
    expect(searchIcons('qqq')).toEqual([])
  })
})
