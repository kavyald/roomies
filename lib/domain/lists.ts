// How the Needs, Chores, and Tasks tabs order and filter items (FRONTEND §5.5–5.7). Pure.

import { activeFeelings, type Feeling, type FeelingWeights } from './feelings'
import type { Member, Room } from './house'
import { throughDay } from './format'
import type { UserId } from './ids'
import {
  choreKey,
  type Category,
  type Chore,
  type ChorePick,
  type Item,
  type Need,
  type Task,
} from './items'
import { chipTier, scorePriority, type Score } from './priority'
import {
  choreOwner,
  listOf,
  nextHolder,
  nextPeriodStart,
  PERIOD_WORDS,
  routineHolder,
  routineProgress,
  type Routine,
} from './routines'
import { addDays, calendarDaysBetween, type Instant, type LocalDate } from './time'

const whenKey = (i: Item) => (i.when ? `${i.when.date} ${i.when.time ?? '99:99'}` : null)

/** Dated first, soonest first; then the rest, newest first. */
const byDateThenNewest = (a: Item, b: Item): number => {
  const ka = whenKey(a)
  const kb = whenKey(b)
  if (ka && kb && ka !== kb) return ka.localeCompare(kb)
  if (ka && !kb) return -1
  if (kb && !ka) return 1
  return b.createdAt.epochMs - a.createdAt.epochMs
}

/** What ranking a tab needs (T108): the house's feelings and weights, and now in its time zone. */
export type Ranking = {
  readonly feelings: readonly Feeling[]
  readonly weights: FeelingWeights
  readonly now: Instant
  readonly tz: string
}

/** An item with its score, as a ranked tab lists it. */
export type Ranked<T extends Item> = { readonly item: T; readonly score: Score }

/**
 * Items by priority (PRD §8.1, T108): the highest score first; equal scores by date (soonest
 * first, undated after), then newest. Nothing is left out for its score.
 */
export const rankItems = <T extends Item>(items: readonly T[], r: Ranking): Ranked<T>[] =>
  items
    .map((item) => ({ item, score: scorePriority(item, r.feelings, r.weights, r.now, r.tz) }))
    .sort((a, b) => b.score.score - a.score.score || byDateThenNewest(a.item, b.item))

const isOpen = (i: Item) => !i.archivedAt && (i.category === 'chore' || !i.done)

export type TaskFilter = 'mine' | 'all' | 'outside'

/**
 * Open tasks for the Tasks tab (FRONTEND §5.7), ranked. Mine = assigned to me; Outside help =
 * handled by a contact.
 */
export const taskList = (
  items: readonly Item[],
  filter: TaskFilter,
  me: UserId,
  r: Ranking,
): Ranked<Task>[] =>
  rankItems(
    items
      .filter((i): i is Task => i.category === 'task' && isOpen(i))
      .filter((t) =>
        filter === 'mine' ? t.assignee === me : filter === 'outside' ? !!t.contactId : true,
      ),
    r,
  )

/** Open needs for the Needs tab (FRONTEND §5.5), ranked: a feeling moves a need up. */
export const needList = (items: readonly Item[], r: Ranking): Ranked<Need>[] =>
  rankItems(
    items.filter((i): i is Need => i.category === 'need' && isOpen(i)),
    r,
  )

/** Chores nobody's on: Upkeep, and Deep clean chores whose room no routine covers. */
const isUpkeep = (c: Chore, rooms: readonly Room[], routines: readonly Routine[]) =>
  !choreOwner(c, rooms, routines)

/**
 * Which tabs get a dot (T108): Needs, Tasks or Chores when something open on it is Urgent. On
 * Chores that's the Upkeep list, the one ranked list there (routine rooms aren't ranked).
 */
export const urgentTabs = (
  items: readonly Item[],
  ctx: Ranking & { readonly rooms: readonly Room[]; readonly routines: readonly Routine[] },
): ReadonlySet<Category> => {
  const open = items.filter(
    (i) => isOpen(i) && (i.category !== 'chore' || isUpkeep(i, ctx.rooms, ctx.routines)),
  )
  return new Set(
    open
      .filter((i) => scorePriority(i, ctx.feelings, ctx.weights, ctx.now, ctx.tz).tier === 'urgent')
      .map((i) => i.category),
  )
}

/** What the chore picker offers before the house has chores of its own (T101). */
export const STARTER_CHORES: readonly ChorePick[] = [
  { title: 'Vacuum', icon: 'robot-vacuum' },
  { title: 'Swiffer', icon: 'mop' },
  { title: 'Dust', icon: 'feather' },
  { title: 'Wipe counters', icon: 'spray-can' },
  { title: 'Clean sink', icon: 'soap-dispenser-droplet' },
  { title: 'Scrub toilet', icon: 'toilet' },
  { title: 'Clean mirror', icon: 'spray-can' },
  { title: 'Clean shower', icon: 'shower-head' },
  { title: 'Wipe stove', icon: 'flame' },
  { title: 'Clean fridge', icon: 'refrigerator' },
  { title: 'Take out trash', icon: 'trash-2' },
  { title: 'Water plants', icon: 'plant-pot' },
]

/**
 * Every chore name in the house, the most-used first, each with the icon it most often has; then
 * the starter names it doesn't have yet. What House → Rooms offers as one-tap picks (T101).
 */
export const choreNames = (items: readonly Item[]): ChorePick[] => {
  const byKey = new Map<string, { title: string; count: number; icons: Map<string, number> }>()
  for (const i of items) {
    if (i.category !== 'chore' || i.archivedAt) continue
    const key = choreKey(i.title)
    const entry = byKey.get(key) ?? { title: i.title.trim(), count: 0, icons: new Map() }
    entry.count += Math.max(1, i.rooms.length)
    if (i.icon) entry.icons.set(i.icon, (entry.icons.get(i.icon) ?? 0) + 1)
    byKey.set(key, entry)
  }
  const house = [...byKey.values()]
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .map(({ title, icons }) => {
      const icon = [...icons].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
      return { title, ...(icon && { icon }) }
    })
  return [...house, ...STARTER_CHORES.filter((s) => !byKey.has(choreKey(s.title)))]
}

/** Calendar days since a chore was last done, as the house sees it, or null if never. */
export const daysSinceDone = (c: Chore, now: Instant, tz: string): number | null =>
  c.lastDone ? calendarDaysBetween(c.lastDone.at, now, tz) : null

/** One room of a routine on the Chores tab: its Deep clean chores, done or not this period. */
export type RoomBox = {
  readonly room: Room
  readonly chores: readonly { readonly chore: Chore; readonly done: boolean }[]
  readonly feelings: readonly Feeling[]
}

/** A routine and what its holder looks after this period (the Chores tab, FRONTEND §5.6). */
export type RoutineCard = {
  readonly routine: Routine
  readonly holder?: UserId
  readonly next?: UserId
  readonly mine: boolean
  /**
   * Its rooms in house order, each with its Deep clean chores (a chore under its first room) and
   * the feelings on them. The Chores tab shows a box for each room that has chores (T101).
   */
  readonly rooms: readonly RoomBox[]
  readonly chores: readonly { readonly chore: Chore; readonly done: boolean }[]
  readonly feelings: readonly Feeling[]
}

export type ChoreBoard = {
  readonly cards: readonly RoutineCard[]
  /**
   * Chores nobody's on, ranked (T108): the rows (someone feels something about it, or it's Urgent
   * or Soon), highest first, then the rest as chips, highest first.
   */
  readonly upkeep: {
    readonly felt: readonly {
      readonly chore: Chore
      readonly feelings: readonly Feeling[]
      readonly tier?: 'urgent' | 'soon'
    }[]
    readonly calm: readonly Chore[]
  }
}

const inHouseOrder = (a: Room, b: Room) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)

/**
 * The Chores tab: a card per routine (yours first, then in their saved order) with its Deep clean
 * chores, then the one Upkeep list for everything nobody's on. Numbers and who's-done-what stay out
 * of it (PRD §6.2): `done` is for the holder's own card.
 */
export const choreBoard = (
  items: readonly Item[],
  ctx: Ranking & {
    rooms: readonly Room[]
    routines: readonly Routine[]
    members: readonly Member[]
    me: UserId
    today: LocalDate
  },
): ChoreBoard => {
  const chores = items
    .filter((i): i is Chore => i.category === 'chore' && !i.archivedAt)
    .sort((a, b) => a.title.localeCompare(b.title))
  const live = ctx.rooms.filter((r) => !r.archivedAt).sort(inHouseOrder)
  const firstRoomOf = (c: Chore) => live.find((r) => c.rooms.includes(r.id))
  const ownerOf = new Map(chores.map((c) => [c.id, choreOwner(c, ctx.rooms, ctx.routines)]))

  const cards = ctx.routines
    .filter((r) => !r.removedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((routine): RoutineCard => {
      const holder = routineHolder(routine, ctx.members, ctx.today)
      const next = nextHolder(routine, ctx.members, ctx.today)
      const own = routineProgress(
        routine,
        chores.filter((c) => ownerOf.get(c.id)?.id === routine.id),
        ctx.today,
        ctx.tz,
      )
      return {
        routine,
        ...(holder && { holder }),
        ...(next && { next }),
        mine: holder === ctx.me,
        rooms: live
          .filter((r) => r.routineId === routine.id)
          .map((room) => {
            const here = own.filter((c) => firstRoomOf(c.chore)?.id === room.id)
            return {
              room,
              chores: here,
              feelings: here.flatMap((c) => activeFeelings(c.chore, ctx.feelings)),
            }
          }),
        chores: own,
        feelings: own.flatMap((c) => activeFeelings(c.chore, ctx.feelings)),
      }
    })
    .sort((a, b) => Number(b.mine) - Number(a.mine))

  // Upkeep, ranked (T108): highest score first; equal scores stay by name.
  const upkeep = chores
    .filter((c) => !ownerOf.get(c.id))
    .map((chore) => {
      const s = scorePriority(chore, ctx.feelings, ctx.weights, ctx.now, ctx.tz)
      const tier = chipTier(s.tier)
      return { chore, score: s.score, feelings: activeFeelings(chore, ctx.feelings), tier }
    })
    .sort((a, b) => b.score - a.score)
  const isRow = (c: (typeof upkeep)[number]) => c.feelings.length > 0 || !!c.tier
  return {
    cards,
    upkeep: {
      felt: upkeep
        .filter(isRow)
        .map(({ chore, feelings, tier }) => ({ chore, feelings, ...(tier && { tier }) })),
      calm: upkeep.filter((c) => !isRow(c)).map((c) => c.chore),
    },
  }
}

/**
 * The Chores tab's top line: "This week you have the kitchen and dining · through Sunday". Nothing
 * if you hold no card. Cards on different schedules have no one date to name: "You have … for now".
 */
export const holdingLine = (
  cards: readonly RoutineCard[],
  today: LocalDate,
): string | undefined => {
  const mine = cards.filter((c) => c.mine)
  if (mine.length === 0) return undefined
  const names = listOf(
    mine.flatMap((c) =>
      c.rooms.length > 0
        ? c.rooms.map((r) => r.room.name.toLowerCase())
        : [c.routine.name.toLowerCase()],
    ),
  )
  const ends = new Set(mine.map((c) => nextPeriodStart(c.routine, today)))
  const resets = new Set(mine.map((c) => c.routine.resets))
  if (ends.size > 1 || resets.size > 1) return `You have the ${names} for now`
  const period = PERIOD_WORDS[mine[0]!.routine.resets]
  const through = throughDay(addDays([...ends][0]!, -1), today)
  return `${period[0]!.toUpperCase()}${period.slice(1)} you have the ${names} · through ${through}`
}

/**
 * Whose a group of rooms is, under its heading (T105): "Yours this week", "Alex's this month", just
 * "Alex's" when it's always theirs. `holder` absent means yours.
 */
export const whoseLine = (routine: Routine, holder?: string): string => {
  const who = holder ? `${holder}'s` : 'Yours'
  return routine.fixedMember ? who : `${who} ${PERIOD_WORDS[routine.resets]}`
}

/**
 * Who has a room, in its sheet (T105): "Alex has it this week, then you"; "You look after it" when
 * it's always yours. `holder` absent means you; `next` is "you" or a name, absent when nobody else is.
 */
export const hasItLine = (routine: Routine, holder?: string, next?: string): string => {
  if (routine.fixedMember) return holder ? `${holder} looks after it` : 'You look after it'
  const now = `${holder ? `${holder} has` : 'You have'} it ${PERIOD_WORDS[routine.resets]}`
  return next ? `${now}, then ${next}` : now
}

/** Chores in words, as a sentence starts: "Sink, stove and floor" (a housemate's room, T105). */
export const choresLine = (chores: RoutineCard['chores']): string =>
  listOf(chores.map((c, i) => (i === 0 ? c.chore.title : c.chore.title.toLowerCase())))

/** What VoiceOver hears for your own card: "Sink and stove done"; "All done"; nothing yet. */
export const doneLine = (chores: RoutineCard['chores']): string | undefined => {
  const done = chores.filter((c) => c.done)
  if (done.length === 0) return undefined
  if (done.length === chores.length) return 'All done'
  return `${choresLine(done)} done`
}

/** "today", "yesterday", "9 days ago". */
export const daysAgo = (days: number): string =>
  days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
