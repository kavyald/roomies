// How the Needs, Chores, and Tasks tabs order and filter items (FRONTEND §5.5–5.7). Pure.

import { activeFeelings, type Feeling } from './feelings'
import type { Member, Room } from './house'
import type { UserId } from './ids'
import type { Chore, Item, Need, Task } from './items'
import { choreOwner, nextHolder, routineHolder, routineProgress, type Routine } from './routines'
import { calendarDaysBetween, type Instant, type LocalDate } from './time'

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

/** Calendar days since a chore was last done, as the house sees it, or null if never. */
export const daysSinceDone = (c: Chore, now: Instant, tz: string): number | null =>
  c.lastDone ? calendarDaysBetween(c.lastDone.at, now, tz) : null

/** A routine and what its holder looks after this period (the Chores tab, FRONTEND §5.6). */
export type RoutineCard = {
  readonly routine: Routine
  readonly holder?: UserId
  readonly next?: UserId
  readonly mine: boolean
  /** Its rooms in house order, each with its deep clean chores (a chore under its first room). */
  readonly rooms: readonly {
    readonly room: Room
    readonly chores: readonly { readonly chore: Chore; readonly done: boolean }[]
  }[]
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
          .map((room) => ({
            room,
            chores: own.filter((c) => firstRoomOf(c.chore)?.id === room.id),
          })),
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

/** "today", "yesterday", "9 days ago". */
export const daysAgo = (days: number): string =>
  days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
