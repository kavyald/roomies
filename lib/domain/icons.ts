// The outline icons a chore or routine can pick (T96, widened in T101), as Lucide's kebab-case names.
// Names only: the domain imports nothing, and components/ui/ChoreIcon maps them to components.
// Feelings stay emoji, and sweeping is a broom, never wind (that's the Air element's icon).
//
// Each icon has a group (the picker's headings) and the words a chore name might use for it:
// `words` are the things it shows (strong), `also` the verbs and loose fits (weak). suggestIcons
// ranks by them, so "Swiffer" suggests the mop and "Wipe stove" the flame before the spray.

export const CHORE_ICON_GROUPS = [
  'Cleaning',
  'Kitchen',
  'Bathroom',
  'Laundry and beds',
  'Living',
  'Trash',
  'Outdoors',
  'Pets',
  'Fix-it',
  'Other',
] as const

export type ChoreIconGroup = (typeof CHORE_ICON_GROUPS)[number]

type Def = {
  readonly group: ChoreIconGroup
  readonly words: readonly string[]
  readonly also?: readonly string[]
}

const DEFS = {
  // Cleaning
  sparkles: {
    group: 'Cleaning',
    words: ['tidy', 'deep clean'],
    also: ['clean', 'polish', 'shine'],
  },
  broom: { group: 'Cleaning', words: ['broom', 'sweep', 'floor', 'floors'], also: ['vacuum'] },
  'broom-sparkles': { group: 'Cleaning', words: ['sweep', 'porch'], also: ['floor'] },
  'robot-vacuum': { group: 'Cleaning', words: ['vacuum', 'hoover', 'carpet', 'rug', 'roomba'] },
  mop: { group: 'Cleaning', words: ['mop', 'swiffer', 'swiff'], also: ['floor', 'floors', 'wet'] },
  'mop-sparkles': { group: 'Cleaning', words: ['mop', 'swiffer'], also: ['polish', 'floor'] },
  feather: { group: 'Cleaning', words: ['dust', 'duster', 'dusting'], also: ['shelves'] },
  'spray-can': {
    group: 'Cleaning',
    words: ['spray', 'mirror', 'mirrors', 'glass', 'window', 'windows', 'counter', 'counters'],
    also: ['wipe', 'disinfect', 'surfaces'],
  },
  'brush-cleaning': { group: 'Cleaning', words: ['brush', 'grout'], also: ['scrub', 'tiles'] },
  droplets: { group: 'Cleaning', words: ['water'], also: ['rinse', 'wet', 'wash'] },
  'paint-bucket': { group: 'Cleaning', words: ['bucket'], also: ['fill'] },
  hand: { group: 'Cleaning', words: ['handles', 'knobs', 'switches'], also: ['wipe', 'touch'] },

  // Kitchen
  utensils: { group: 'Kitchen', words: ['dishes', 'cutlery', 'silverware', 'dish'] },
  'utensils-crossed': { group: 'Kitchen', words: ['dinner', 'meal', 'table'], also: ['dishes'] },
  'cooking-pot': { group: 'Kitchen', words: ['pots', 'pans', 'pot', 'pan', 'cook', 'cooking'] },
  flame: { group: 'Kitchen', words: ['stove', 'stovetop', 'burner', 'burners', 'oven', 'grill'] },
  refrigerator: { group: 'Kitchen', words: ['fridge', 'freezer', 'refrigerator'] },
  microwave: { group: 'Kitchen', words: ['microwave'] },
  'glass-water': { group: 'Kitchen', words: ['glasses', 'cups', 'cup', 'water filter', 'brita'] },
  coffee: { group: 'Kitchen', words: ['coffee', 'kettle', 'espresso', 'mugs'] },
  'chef-hat': { group: 'Kitchen', words: ['kitchen'], also: ['cook'] },
  soup: { group: 'Kitchen', words: ['bowls', 'leftovers'] },
  'shopping-basket': { group: 'Kitchen', words: ['groceries', 'grocery', 'pantry'] },
  carrot: { group: 'Kitchen', words: ['vegetables', 'produce', 'veggies'] },
  milk: { group: 'Kitchen', words: ['milk', 'bottles'] },

  // Bathroom
  toilet: { group: 'Bathroom', words: ['toilet', 'loo', 'bathroom'] },
  bath: { group: 'Bathroom', words: ['tub', 'bath', 'bathtub'] },
  'shower-head': { group: 'Bathroom', words: ['shower', 'showers'] },
  'soap-dispenser-droplet': { group: 'Bathroom', words: ['sink', 'sinks', 'soap', 'refill soap'] },
  toothbrush: { group: 'Bathroom', words: ['toothbrush', 'teeth'], also: ['sink'] },
  'towel-rack': { group: 'Bathroom', words: ['towel', 'towels', 'bath mat', 'hand towels'] },
  bubbles: { group: 'Bathroom', words: ['bubbles', 'foam', 'drain'], also: ['soak'] },

  // Laundry and beds
  'washing-machine': { group: 'Laundry and beds', words: ['laundry', 'washer', 'dryer', 'lint'] },
  shirt: { group: 'Laundry and beds', words: ['clothes', 'fold', 'folding', 'iron', 'ironing'] },
  bed: { group: 'Laundry and beds', words: ['bed', 'sheets', 'make bed'] },
  'bed-double': { group: 'Laundry and beds', words: ['linens', 'bedding', 'duvet', 'pillows'] },
  'bed-single': { group: 'Laundry and beds', words: ['guest bed', 'mattress'] },

  // Living
  sofa: { group: 'Living', words: ['couch', 'sofa', 'cushions', 'living room'] },
  armchair: { group: 'Living', words: ['chair', 'chairs', 'armchair'] },
  tv: { group: 'Living', words: ['tv', 'television', 'screen', 'remote'] },
  'book-open': { group: 'Living', words: ['books', 'bookshelf', 'shelf', 'shelves'] },
  lamp: { group: 'Living', words: ['lamp', 'lamps'] },
  'lamp-floor': { group: 'Living', words: ['floor lamp'], also: ['lamp'] },
  lightbulb: { group: 'Living', words: ['bulb', 'bulbs', 'lights', 'light'] },
  blinds: { group: 'Living', words: ['blinds', 'curtains', 'shades'], also: ['windows'] },
  fan: { group: 'Living', words: ['fan', 'fans', 'ceiling fan'] },
  'air-vent': { group: 'Living', words: ['vent', 'vents', 'filter', 'filters', 'ac', 'hvac'] },
  heater: { group: 'Living', words: ['heater', 'radiator', 'radiators', 'heat'] },
  'door-open': { group: 'Living', words: ['door', 'doors', 'entry', 'front door', 'hallway'] },
  frame: { group: 'Living', words: ['frames', 'pictures', 'art', 'walls'] },
  boxes: { group: 'Living', words: ['storage', 'clutter', 'declutter', 'closet'] },
  dumbbell: { group: 'Living', words: ['gym', 'fitness', 'weights', 'workout'] },
  house: { group: 'Living', words: ['house', 'home', 'whole house'] },

  // Trash
  'trash-2': { group: 'Trash', words: ['trash', 'garbage', 'bin', 'bins', 'rubbish', 'take out'] },
  recycle: { group: 'Trash', words: ['recycling', 'recycle', 'cans'] },
  package: { group: 'Trash', words: ['boxes', 'box', 'cardboard', 'break down', 'packages'] },
  apple: { group: 'Trash', words: ['compost', 'food scraps', 'fruit'] },
  mailbox: { group: 'Trash', words: ['mail', 'mailbox', 'letters'] },

  // Outdoors
  'plant-pot': { group: 'Outdoors', words: ['plants', 'plant', 'houseplants', 'water plants'] },
  sprout: { group: 'Outdoors', words: ['weed', 'weeds', 'weeding', 'seedlings'] },
  flower: { group: 'Outdoors', words: ['flowers', 'flower', 'flower beds'] },
  'flower-2': { group: 'Outdoors', words: ['bouquet', 'vase'] },
  leaf: { group: 'Outdoors', words: ['leaves', 'rake', 'raking'] },
  trees: { group: 'Outdoors', words: ['yard', 'garden', 'backyard', 'trees'] },
  shrub: { group: 'Outdoors', words: ['hedge', 'hedges', 'bushes', 'trim'] },
  shovel: { group: 'Outdoors', words: ['shovel', 'dig'], also: ['snow'] },
  snowflake: { group: 'Outdoors', words: ['snow', 'ice', 'salt', 'defrost'] },
  sun: { group: 'Outdoors', words: ['patio', 'deck', 'balcony', 'porch'] },
  fence: { group: 'Outdoors', words: ['fence', 'gate'] },
  car: { group: 'Outdoors', words: ['car', 'driveway', 'garage', 'parking'] },
  bike: { group: 'Outdoors', words: ['bike', 'bikes'] },

  // Pets
  'paw-print': { group: 'Pets', words: ['pet', 'pets', 'litter', 'litter box'] },
  dog: { group: 'Pets', words: ['dog', 'walk dog', 'puppy'] },
  cat: { group: 'Pets', words: ['cat', 'kitty'] },
  bone: { group: 'Pets', words: ['pet food', 'treats', 'feed'] },
  fish: { group: 'Pets', words: ['fish', 'aquarium', 'tank'] },
  bird: { group: 'Pets', words: ['bird', 'birds', 'cage', 'feeder'] },
  rabbit: { group: 'Pets', words: ['rabbit', 'bunny', 'hamster'] },

  // Fix-it
  wrench: { group: 'Fix-it', words: ['fix', 'repair', 'plumbing', 'leak'] },
  hammer: { group: 'Fix-it', words: ['hammer', 'nails', 'hang'] },
  drill: { group: 'Fix-it', words: ['drill', 'assemble', 'mount'] },
  toolbox: { group: 'Fix-it', words: ['tools', 'toolbox', 'maintenance'] },
  paintbrush: { group: 'Fix-it', words: ['paint', 'painting', 'touch up'] },
  'paint-roller': { group: 'Fix-it', words: ['repaint', 'roller'], also: ['walls'] },
  plug: { group: 'Fix-it', words: ['outlet', 'outlets', 'plug', 'cords', 'cables'] },
  battery: { group: 'Fix-it', words: ['battery', 'batteries', 'smoke detector'] },
  siren: { group: 'Fix-it', words: ['alarm', 'smoke alarm', 'detector'] },
  key: { group: 'Fix-it', words: ['keys', 'key', 'locks'] },
  scissors: { group: 'Fix-it', words: ['scissors', 'cut', 'crafts', 'craft'] },
  ruler: { group: 'Fix-it', words: ['measure', 'ruler'] },
  thermometer: { group: 'Fix-it', words: ['thermostat', 'temperature'] },
  router: { group: 'Fix-it', words: ['wifi', 'router', 'internet', 'modem'] },

  // Other
  'list-checks': { group: 'Other', words: ['checklist', 'list', 'chores'] },
  'calendar-check': { group: 'Other', words: ['schedule', 'calendar', 'booking'] },
  'shopping-cart': { group: 'Other', words: ['shopping', 'supplies', 'restock', 'buy'] },
  gift: { group: 'Other', words: ['gift', 'present', 'party'] },
  baby: { group: 'Other', words: ['baby', 'kids', 'nursery'] },
  pill: { group: 'Other', words: ['medicine', 'first aid', 'meds'] },
  lock: { group: 'Other', words: ['lock up', 'security'], also: ['locks'] },
} as const satisfies Record<string, Def>

export type ChoreIconName = keyof typeof DEFS

export const CHORE_ICONS = Object.keys(DEFS) as readonly ChoreIconName[]

export const isChoreIcon = (s: string): s is ChoreIconName => Object.hasOwn(DEFS, s)

export const choreIconGroup = (name: ChoreIconName): ChoreIconGroup => DEFS[name].group

// Where Lucide's name doesn't say what a person sees, or two would read the same to VoiceOver.
const LABELS: Partial<Record<ChoreIconName, string>> = {
  'broom-sparkles': 'Shiny broom',
  'mop-sparkles': 'Shiny mop',
  'brush-cleaning': 'Scrub brush',
  'paint-bucket': 'Bucket',
  'soap-dispenser-droplet': 'Soap dispenser',
  'utensils-crossed': 'Fork and knife',
  'glass-water': 'Glass of water',
  'flower-2': 'Bouquet',
  'list-checks': 'Checklist',
  'calendar-check': 'Calendar',
}

/** "spray-can" → "Spray can"; a trailing Lucide number ("trash-2") isn't part of the word. */
export const choreIconLabel = (name: string): string => {
  const label = LABELS[name as ChoreIconName]
  if (label) return label
  const words = name.replace(/-\d+$/, '').replace(/-/g, ' ')
  return words[0]!.toUpperCase() + words.slice(1)
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// "dishes" and "dish", "windows" and "window": a word matches its plural and its stem.
const sameWord = (a: string, b: string) =>
  a === b || a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`

/** How well a phrase (a word list entry) fits the text: every one of its words is in it. */
const fits = (phrase: string, words: readonly string[]) =>
  phrase.split(' ').every((p) => words.some((w) => sameWord(w, p)))

const score = (name: ChoreIconName, words: readonly string[]): number => {
  const def: Def = DEFS[name]
  let s = 0
  for (const phrase of def.words) if (fits(phrase, words)) s += 2 + phrase.split(' ').length
  for (const phrase of def.also ?? []) if (fits(phrase, words)) s += 1
  return s
}

/**
 * Icons for a chore's name, best first ("Swiffer the kitchen" → mop first). Ties keep the list's
 * order, so each group's everyday icon wins. Empty when nothing fits.
 */
export const suggestIcons = (title: string, limit = 6): ChoreIconName[] => {
  const words = norm(title).split(' ').filter(Boolean)
  if (words.length === 0) return []
  return CHORE_ICONS.map((name, i) => ({ name, i, s: score(name, words) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.name)
}

/**
 * The picker's search: icons whose name or words start with what's typed ("vac" finds the robot
 * vacuum), in list order.
 */
export const searchIcons = (query: string): ChoreIconName[] => {
  const q = norm(query)
  if (!q) return [...CHORE_ICONS]
  return CHORE_ICONS.filter((name) => {
    const def: Def = DEFS[name]
    const terms = [choreIconLabel(name).toLowerCase(), ...def.words, ...(def.also ?? [])]
    return terms.some((t) => t.split(' ').some((w) => w.startsWith(q)) || t.startsWith(q))
  })
}
