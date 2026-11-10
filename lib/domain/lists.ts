// How the Needs, Chores, and Tasks tabs order and filter items (FRONTEND §5.5–5.7). Pure.

import { activeFeelings, type Feeling } from './feelings'
import type { Member, Room } from './house'
import { throughDay } from './format'
import type { UserId } from './ids'
import { choreKey, type Chore, type ChorePick, type Item, type Need, type Task } from './items'
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

export type TaskFilter = 'mine' | 'all' | 'outside'

/**
 * Open tasks for the Tasks tab. Mine = assigned to me; Outside help = handled by a contact.
 * Dated tasks first, soonest first; then the rest, newest first.
 */
export const taskList = (items: readonly Item[], filter: TaskFilter, me: UserId): Task[] =>
  items
    .filter((i): i is Task => i.category === 'task' && !i.done && !i.archivedAt)
    .filter((t) =>
      filter === 'mine' ? t.assignee === me : filter === 'outside' ? !!t.contactId : true,
    )
    .sort((a, b) => {
      const ka = whenKey(a)
      const kb = whenKey(b)
      if (ka && kb) return ka.localeCompare(kb)
      if (ka) return -1
      if (kb) return 1
      return b.createdAt.epochMs - a.createdAt.epochMs
    })

/**
 * Open needs for the Needs tab (FRONTEND §5.5): the ones someone has a feeling about first
 * (ranked by `feelingScore`, highest first), then by needed-by date, then newest.
 */
export const needList = (
  items: readonly Item[],
  feelingScore: (id: Item['id']) => number = () => 0,
): Need[] =>
  items
    .filter((i): i is Need => i.category === 'need' && !i.done && !i.archivedAt)
    .sort((a, b) => {
      const fa = feelingScore(a.id)
      const fb = feelingScore(b.id)
      if (fa !== fb) return fb - fa
      const ka = whenKey(a)
      const kb = whenKey(b)
      if (ka && kb && ka !== kb) return ka.localeCompare(kb)
      if (ka && !kb) return -1
      if (kb && !ka) return 1
      return b.createdAt.epochMs - a.createdAt.epochMs
    })

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
 * the starter names it doesn't have yet. What Admin → Rooms offers as one-tap picks (T101).
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
  /** Chores nobody's on: the ones someone feels something about first, then the rest. */
  readonly upkeep: {
    readonly felt: readonly { readonly chore: Chore; readonly feelings: readonly Feeling[] }[]
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
  ctx: {
    rooms: readonly Room[]
    routines: readonly Routine[]
    members: readonly Member[]
    feelings: readonly Feeling[]
    me: UserId
    today: LocalDate
    tz: string
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

  const nobodys = chores.filter((c) => !ownerOf.get(c.id))
  const withFeelings = nobodys.map((chore) => ({
    chore,
    feelings: activeFeelings(chore, ctx.feelings),
  }))
  const latest = (fs: readonly Feeling[]) => Math.max(...fs.map((f) => f.at.epochMs))
  return {
    cards,
    upkeep: {
      felt: withFeelings
        .filter((c) => c.feelings.length > 0)
        .sort((a, b) => latest(b.feelings) - latest(a.feelings)),
      calm: withFeelings.filter((c) => c.feelings.length === 0).map((c) => c.chore),
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

/** What VoiceOver hears for your own card: "Sink and stove done"; "All done"; nothing yet. */
export const doneLine = (chores: RoutineCard['chores']): string | undefined => {
  const done = chores.filter((c) => c.done)
  if (done.length === 0) return undefined
  if (done.length === chores.length) return 'All done'
  const titles = done.map((c, i) => (i === 0 ? c.chore.title : c.chore.title.toLowerCase()))
  return `${listOf(titles)} done`
}

/** "today", "yesterday", "9 days ago". */
export const daysAgo = (days: number): string =>
  days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
