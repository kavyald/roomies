// The outline icons a chore or routine can pick (T96), as Lucide's kebab-case names. Names only: the
// domain imports nothing, and components/ui/ChoreIcon maps them to components. Feelings stay emoji,
// and sweeping is a broom, never wind (that's the Air element's icon).

export const CHORE_ICONS = [
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
] as const

export type ChoreIconName = (typeof CHORE_ICONS)[number]

export const isChoreIcon = (s: string): s is ChoreIconName =>
  (CHORE_ICONS as readonly string[]).includes(s)
